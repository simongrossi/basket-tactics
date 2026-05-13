// Calcul d'une frame interpolée pendant le playback (lecture continue OU
// scrub timeline). Code partagé pour les deux usages — sinon les deux
// chemins divergent et on retrouve les bugs de scrub vs play.
//
// Cette fonction est PURE : prend un état + un instant fractionnaire `t`,
// retourne la frame complète. Le hook `usePlaybackAnimation` se contente
// de l'appeler à chaque tick.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedAttackerVisuals,
  ComputedDefense,
  DefenderId,
  DetectedOffBallScreen,
  DetectedScreen,
  Point,
} from '@/lib/types';
import {
  computeAttackerVisuals,
  effectiveDefensePositions,
  followDefendersAtFrame,
  getDefenseHoop,
  getMatchupsAt,
  recomputeDefenseFrameOrientations,
} from '../engine';
import {
  computeBallFrame,
  curveAroundObstacle,
  curveAroundStaggeredPair,
  pickBlockingCluster,
  pickStaggeredPair,
  pushOutOfMany,
  resolvePlayerCollisions,
} from '../geometry';
import { activeBallCarrier, activeOffense } from '../players';
import { attackerTrajectoryAt, type MovementType } from '../playbackTrajectory';
import { lerpAngleDeg } from '../angles';
import { buildStep0DetectionPositions } from '../step0Detection';
import { closeoutEasing } from '../closeoutEasing';
import {
  PLAYER_MIN_CLEARANCE_PX,
  PLAYER_OBSTACLE_RADIUS_PX,
} from '@/lib/data/court';
import {
  carrierApexSlownessFromQuality,
  carrierScreenRoutePreference,
  effectiveScreenRuleForDef,
  forcedPushSignForRoute,
  offBallScreenRoutePreference,
  screenContactAdhesion,
  screenContactPhase,
  screenContactT,
  screenContactTangentRelease,
} from '../screenPhysics';
import {
  buildSegmentScreenObstacles,
  defenderScreenContact,
  detectScreenContext,
  emptyScreenContext,
  hasCarrierScreenAnnotation,
  screenContactScreenerPoint,
  type ScreenContext,
  type ScreenObstacle,
} from '../screenContext';

export interface PlaybackFrame {
  off: AttackerPositions;
  defPos: ComputedDefense;
  carrier: AttackerId;
  screen: DetectedScreen | null;
  offBallScreens: DetectedOffBallScreen[];
  stepIdx: number;
  ballPos: Point;
  ballInFlight: boolean;
  attVisuals: ComputedAttackerVisuals;
  attackerIsScreening: Partial<Record<AttackerId, boolean>>;
  attackerMovementType: Partial<Record<AttackerId, MovementType>>;
}

export interface ResolveFrameOptions {
  /** Force l'index de step retourné dans la frame. Par défaut : `floor(t)`
   *  (utilisé par le playback continu). Le scrub passe `Math.round(t)`
   *  pour afficher le step le plus proche du curseur. */
  stepIdx?: number;
  /** Frame précédente du playback (frame N-1). Utilisée pour limiter
   *  les sauts de défenseurs > MAX_DEFENDER_JUMP_PX/frame (anti-snap
   *  visuel). Non passé en scrub → rate limiter désactivé.
   *  Cf. docs/SCREEN-ENGINE.md "Bug résiduel" + commit dédié. */
  prevFrame?: PlaybackFrame;
}

/** Saut maximum autorisé par frame sur la position d'un défenseur.
 *  À 60 fps : 18 px/frame = 1080 px/s ≈ 29 m/s. Au-delà = snap visuel
 *  (cause typique : screen detection qui change entre frames adjacentes,
 *  Bezier qui flip de côté, adhesion qui change brutalement de blend).
 *  En clamp à cette valeur, le défenseur rattrape son retard en ~5 frames
 *  (= 80ms) sur un saut de 90 px. Imperceptible visuellement. */
const MAX_DEFENDER_JUMP_PX = 18;

/** Saut maximum autorisé par frame sur la position d'un attaquant.
 *  Identique aux défenseurs : 18 px/frame = 1080 px/s ≈ 29 m/s. Un cut basket
 *  réel à 7 m/s ≈ 4.4 px/frame, largement sous le seuil. Borne les pics
 *  de `curveAroundObstacle` quand le cluster bouge (cause du jump O2 mi-Pindown). */
const MAX_ATTACKER_JUMP_PX = 18;

/**
 * Résout la frame complète à l'instant `t` (en unités de step fractionnaires).
 * `t` est clampé à [0, steps.length - 1]. Retourne `null` si le scénario n'a
 * pas au moins 2 étapes (pas d'interpolation possible).
 */
export function resolveFrameAt(
  state: AppState,
  t: number,
  options: ResolveFrameOptions = {}
): PlaybackFrame | null {
  const totalSteps = state.steps.length - 1;
  if (totalSteps <= 0) return null;

  const clamped = Math.max(0, Math.min(totalSteps, t));
  const idxA = Math.floor(clamped);
  const idxB = Math.min(idxA + 1, totalSteps);
  const localT = clamped - idxA;

  const a = state.steps[idxA];
  const b = state.steps[idxB];
  const offA = activeOffense(a.off, state.playerCount);
  const offB = activeOffense(b.off, state.playerCount);
  const defA = effectiveDefensePositions(state, idxA);
  const defB = effectiveDefensePositions(state, idxB);

  const attackerIds = Object.keys(offA) as AttackerId[];
  const defenderIds = Object.keys(defA) as DefenderId[];

  // ---------------------------------------------------------------------
  // 1. Positions attaquants — trajectoire pilotée par les annotations,
  //    avec évitement d'obstacles uniquement pour cut/idle.
  // ---------------------------------------------------------------------
  const off = {} as AttackerPositions;
  const attackerMovementType: Partial<Record<AttackerId, MovementType>> = {};
  const attackerIsScreening: Partial<Record<AttackerId, boolean>> = {};
  attackerIds.forEach((id) => {
    const traj = attackerTrajectoryAt(state.steps, idxA, id, localT);
    attackerMovementType[id] = traj.movementType;
    attackerIsScreening[id] = traj.isScreening;
    let p = traj.position;

    // Évitement d'obstacles : appliqué pour TOUS les types de mouvement
    // (cut, idle, dribble). Avant : seulement cut/idle ; conséquence — un
    // porteur en dribble dont la trajectoire passe pile sur un autre joueur
    // se faisait pousser violemment par le solveur d'anti-superposition en
    // 1.b (jusqu'à 30 px en 1 frame, effet de téléport visible à f435/436
    // dans le Screen Lab). En courbant LA TRAJECTOIRE en amont via une
    // Bezier autour de l'obstacle, le dribble dévie en douceur — plus de
    // snap. Le `screen` movementType reste exclu : le poseur DOIT atteindre
    // sa position de pose, pas l'éviter.
    if (
      traj.movementType === 'cut' ||
      traj.movementType === 'idle' ||
      traj.movementType === 'dribble'
    ) {
      const obstacles: ScreenObstacle[] = [];
      attackerIds.forEach((other) => {
        if (other === id) return;
        obstacles.push({
          center: midpoint(offA[other], offB[other]),
          radius: PLAYER_OBSTACLE_RADIUS_PX,
          defenderToSkip: 'D1' as DefenderId,
        });
      });
      defenderIds.forEach((dId) => {
        obstacles.push({
          center: midpoint(defA[dId], defB[dId]),
          radius: PLAYER_OBSTACLE_RADIUS_PX,
          defenderToSkip: 'D1' as DefenderId,
        });
      });
      const blocking = pickBlockingCluster(offA[id], offB[id], obstacles);
      if (blocking) {
        p = curveAroundObstacle(offA[id], offB[id], blocking.center, blocking.radius, localT);
      }
    }

    off[id] = p;
  });

  // 1.b — Anti-superposition attaquant ↔ attaquant pendant l'interpolation.
  // Sans ce solveur, deux attaquants dont les trajectoires SE CROISENT (ex :
  // O1 dribble vers la droite + O3 vient poser un écran au milieu) peuvent
  // être visuellement empilés à mi-segment. La règle absolue
  // (cf. docs/PLAYER-CLEARANCE.md) interdit toute superposition, frame par
  // frame. On itère 5 passes (suffisant pour 5 attaquants).
  for (let iter = 0; iter < 5; iter++) {
    let moved = false;
    for (const id of attackerIds) {
      const p = off[id];
      const obstacles: Point[] = [];
      for (const other of attackerIds) {
        if (other !== id) obstacles.push(off[other]);
      }
      const pushed = pushOutOfMany(p, obstacles, PLAYER_MIN_CLEARANCE_PX);
      if (Math.abs(pushed.x - p.x) > 0.1 || Math.abs(pushed.y - p.y) > 0.1) {
        off[id] = pushed;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // 1.c — Rate limiter sur attaquants : clamp les sauts > MAX_ATTACKER_JUMP_PX
  // par frame. Évite que `curveAroundObstacle` produise des pics quand le
  // cluster d'obstacles bouge (cause d'un saut > 20 px sur O2 mi-Pindown).
  // Appliqué APRÈS le solveur anti-superposition (qui peut avoir lui-même
  // injecté un déplacement) et AVANT le calcul défenseur (qui dépend des
  // positions attaquantes finales).
  if (options.prevFrame) {
    const prevOff = options.prevFrame.off;
    attackerIds.forEach((id) => {
      const p0 = prevOff[id];
      const p1 = off[id];
      if (!p0 || !p1) return;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const d = Math.hypot(dx, dy);
      if (d > MAX_ATTACKER_JUMP_PX) {
        const k = MAX_ATTACKER_JUMP_PX / d;
        off[id] = { x: p0.x + dx * k, y: p0.y + dy * k };
      }
    });
  }

  // ---------------------------------------------------------------------
  // 2. Porteur courant + détection d'écrans (uniquement en man-to-man).
  // ---------------------------------------------------------------------
  const carrierA = activeBallCarrier(a, state.playerCount);
  const carrierB = activeBallCarrier(b, state.playerCount);
  let ctxA: ScreenContext = emptyScreenContext();
  let ctxB: ScreenContext = emptyScreenContext();
  let currentCtx: ScreenContext = emptyScreenContext();
  // STABILISATION DU CARRIER : on n'utilise PLUS le switch à t=0.5
  // (`carrier = localT < 0.5 ? carrierA : carrierB`) qui créait un saut de
  // contexte à mi-segment lors d'une passe. On prend systématiquement le
  // carrier de DESTINATION (carrierB) pour toute la transition. La balle
  // visuellement vole d'A à B via `computeBallFrame`, indépendamment du
  // flag carrier. Le contexte d'écran reste cohérent pendant tout le
  // segment ; les détections endpoints (screenA/B) couvrent les deux cas.
  const carrier = carrierB;
  let screen: DetectedScreen | null = null;
  let offBallScreens: DetectedOffBallScreen[] = [];
  if (state.defenseSystem === 'man') {
    const matchupsA = getMatchupsAt(state.steps, Math.max(0, idxA - 1), state.playerCount);
    const matchupsB = getMatchupsAt(state.steps, Math.max(0, idxB - 1), state.playerCount);
    const defPlainA = plainDefPositions(defA);
    const defPlainB = plainDefPositions(defB);
    ctxA = detectScreenContext({
      off: offA,
      carrier: carrierA,
      matchups: matchupsA,
      defenderPositions: defPlainA,
      screenRadius: state.screenRadius,
      forcedScreener: a.forcedScreener,
    });
    ctxB = detectScreenContext({
      off: offB,
      carrier: carrierB,
      matchups: matchupsB,
      defenderPositions: defPlainB,
      screenRadius: state.screenRadius,
      forcedScreener: b.forcedScreener,
    });

    const matchups = getMatchupsAt(state.steps, Math.max(0, idxB - 1), state.playerCount);
    const defPosLinear = {} as Record<DefenderId, Point>;
    defenderIds.forEach((id) => {
      defPosLinear[id] = lerpPoint(defA[id], defB[id], localT);
    });
    const detectionPos: Record<DefenderId, Point> = (idxA === 0 && idxB === 0)
      ? buildStep0DetectionPositions(state, off, carrier, matchups, defPosLinear)
      : defPosLinear;
    // forcedScreener pris UNIQUEMENT sur step B (pas de bascule à t=0.5).
    const forced = b.forcedScreener;
    currentCtx = detectScreenContext({
      off,
      carrier,
      matchups,
      defenderPositions: detectionPos,
      screenRadius: state.screenRadius,
      forcedScreener: forced,
    });
    screen = currentCtx.screen;
    offBallScreens = currentCtx.offBallScreens;
  }

  // ---------------------------------------------------------------------
  // 3. Obstacles "cluster" (poseur + son défenseur) pour contourner les
  //    écrans pendant le segment. Position MOYENNE A↔B → obstacle stable.
  // ---------------------------------------------------------------------
  const screenerObstacles: ScreenObstacle[] = [];
  // Clusters d'écran (porteur + off-ball) construits UNIQUEMENT depuis les
  // détections STABLES aux endpoints (screenA, screenB), pas depuis la
  // détection courante interpolée `screen`. Pourquoi :
  //  - `screen` (interpolé) peut fire par intermittence pendant le scrub
  //    si D1 et le poseur se croisent géométriquement mid-segment
  //  - Conséquence : `screenerObstacles` apparaît/disparaît au scrub →
  //    `curveAroundObstacle` apparaît/disparaît → D1 saute visuellement
  //    (cas reproduit avec systeme_basket-8.json où O3 se déplace de 140px
  //    pendant le segment)
  // En n'utilisant que les endpoints, le cluster est soit présent toute la
  // transition (screen détecté à un endpoint), soit absent toute la
  // transition. Pas de flicker.
  screenerObstacles.push(...buildSegmentScreenObstacles(ctxA, ctxB, offA, offB, defA, defB));

  // ---------------------------------------------------------------------
  // 4. Positions défenseurs — interpolation linéaire + courbe d'évitement.
  // ---------------------------------------------------------------------
  const defPos = {} as ComputedDefense;
  const defenseHoop = getDefenseHoop(state);
  // Défenseurs dont la position vient d'être calculée avec freeze/courbe/
  // easing (phase de contact d'écran). `followDefendersAtFrame` doit les
  // SAUTER, sinon il réécrit la position en suivant l'homme et annule tout
  // le réalisme du contact.
  const screenLockedDefenders = new Set<DefenderId>();
  defenderIds.forEach((id) => {
    const candidates = screenerObstacles.filter((o) => id !== o.defenderToSkip);

    // Détection du mode de contact d'écran pour ce défenseur. La transition
    // peut être :
    //  - 'arriving' (defB onScreen, defA pas) : D1 atteint le poseur et y
    //    reste figé pendant la queue de la transition.
    //  - 'leaving' (defA onScreen, defB pas) : D1 vient de se libérer ; on
    //    le maintient figé au départ puis il rattrape.
    //  - 'stuck' (both onScreen) : encore plaqué — freeze au milieu.
    // Stable : on prend uniquement defB pour ce flag (le step de destination).
    // Le OR avec defA créait un saut de contexte mid-segment quand un défenseur
    // changeait de rôle (carrier↔off-ball) pendant la transition (ex passe).
    const isCarrierDef = defB[id].isCarrierDefender;
    const contact = defenderScreenContact({
      state,
      defenderId: id,
      isCarrierDef,
      ctxA,
      ctxB,
      currentCtx,
      idxA,
      idxB,
    });
    const screenMode = contact.mode;
    const modeQuality = contact.quality;
    // Time-remap sigmoïdal qui FIGE D1 sur le poseur (smooth, sans
    // discontinuité de vélocité). Pour les autres défenseurs ou hors
    // écran, identité = localT.
    let effT = screenContactT(localT, modeQuality, screenMode);
    // C.1 — Closeout footwork : si ce défenseur est en closeout et PAS
    // déjà en screen mode (le screen easing prime), applique un easing
    // sprint(65 %) puis freinage(35 %) sur la transition. Visuellement :
    // il s'élance fort, arrive "in control" avec bras hauts.
    // Cf. `lib/logic/closeoutEasing.ts`.
    if (!screenMode && defB[id].closingOut) {
      effT = closeoutEasing(effT);
    }
    const phase = screenContactPhase(screenMode, localT, modeQuality);
    // Décision de verrouillage contre followDefendersAtFrame. Plusieurs
    // conditions cumulatives pour assurer la continuité visuelle :
    const isInRecoveryA = defA[id].screenPhase === 'recover' && defA[id].late;
    const isInRecoveryB = defB[id].screenPhase === 'recover' && defB[id].late;
    const isImpactA = defA[id].screenPhase === 'impact';
    const isImpactB = defB[id].screenPhase === 'impact';
    // Annotation utilisateur dans step A ou B (poseur slip non détecté
    // par la géométrie). Ne lock que pour le défenseur du porteur.
    const hasUserScreen = isCarrierDef &&
      (hasCarrierScreenAnnotation(a, carrierA) || hasCarrierScreenAnnotation(b, carrierB));
    // Pour la stabilisation, on lock SEULEMENT si l'écran a une qualité
    // non-triviale. À quality < 10 (ghost = faux écran), l'utilisateur
    // indique explicitement qu'il n'y a pas de vrai contact ; D1 doit
    // suivre O1 normalement. Sinon, on bloque pour préserver le réalisme.
    const meaningfulQuality = modeQuality >= 10;
    if ((screenMode && meaningfulQuality) || hasUserScreen ||
        ((isInRecoveryA || isInRecoveryB || isImpactA || isImpactB) && meaningfulQuality)) {
      screenLockedDefenders.add(id);
    }

    let p = lerpPoint(defA[id], defB[id], effT);

    // Le défenseur du porteur qui prend l'écran subit un easing FORT au
    // sommet du contournement quand sa ligne croise un cluster, modulé par
    // la qualité de l'écran. Cumulé avec le freeze ci-dessus pour des
    // transitions vraiment palpables.
    const apexSlowness = screenMode
      ? carrierApexSlownessFromQuality(modeQuality)
      : 0.3;
    const routePreference = screen?.carrierDef === id
      ? carrierScreenRoutePreference(
          effectiveScreenRuleForDef(state, screen.carrierDef),
          screen,
          off,
          defenseHoop
        )
      : contact.offBallContact
        ? offBallScreenRoutePreference(contact.offBallContact, state.offBallScreenRule, off[carrier])
        : null;
    let forcedPushSign = routePreference
      ? forcedPushSignForRoute(defA[id], defB[id], routePreference)
      : undefined;
    // Override pour mode 'stuck' : si defA et defB sont de côtés OPPOSÉS du
    // poseur, le forcedPushSign basé sur la rule peut router D1 via la rule
    // (ex hedge → awayFromHoop) au lieu de respecter le côté où il était.
    // Conséquence visuelle : D1 plaqué à gauche du poseur saute à droite
    // d'un coup en passant à travers le cluster. Fix : forcer le côté à
    // matcher celui de defA (où D1 EST déjà), assure que le contournement
    // se fait dans la continuité.
    if (screenMode === 'stuck' && screenerObstacles.length > 0) {
      const obs = screenerObstacles[0];
      const segDx = defB[id].x - defA[id].x;
      const segDy = defB[id].y - defA[id].y;
      const segLen = Math.hypot(segDx, segDy);
      if (segLen > 0.01) {
        const perpX = -segDy / segLen;
        const perpY = segDx / segLen;
        const aToO = { x: obs.center.x - defA[id].x, y: obs.center.y - defA[id].y };
        const aSide = aToO.x * perpX + aToO.y * perpY;
        // Si defA est du côté +perp (aSide > 0), pushSign doit être -1 pour
        // que le contournement aille DE L'AUTRE côté (sinon D1 se fait
        // pousser dans le poseur). Convention de curveAroundObstacle :
        // pushSign correspond au côté du point de contrôle.
        forcedPushSign = aSide >= 0 ? -1 : 1;
      }
    }
    // Pendant la phase 'leaving' (recover), D1 ne doit PAS être routé autour
    // du poseur via Bezier — il sort du contact en ligne droite vers sa nouvelle
    // cible. La Bezier en recovery faisait orbiter D1 vers le côté OPPOSÉ
    // au stuck point (selon forcedPushSign), créant le bug "il rattrape le
    // retard à l'opposé du cercle puis revient".
    const allowCurve = screenMode !== 'leaving';
    const pair = allowCurve ? pickStaggeredPair(defA[id], defB[id], candidates) : null;
    if (pair) {
      p = curveAroundStaggeredPair(defA[id], defB[id], pair[0], pair[1], effT);
    } else if (allowCurve) {
      const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
      if (blocking) {
        p = curveAroundObstacle(
          defA[id],
          defB[id],
          blocking.center,
          blocking.radius,
          effT,
          apexSlowness,
          forcedPushSign
        );
      }
    }
    const adhesion = screenContactAdhesion(localT, modeQuality, screenMode);
    if (adhesion > 0 && screenMode) {
      // Position du poseur FIGÉE au moment du contact (pas l'interpolation
      // courante). En basket réel, D1 reste où il s'est fait bumper — il
      // ne suit pas le poseur qui slip ou roll après l'impact. Sans cet
      // ancrage, si le poseur traverse l'axe defA→defB pendant le segment,
      // contactPoint flip de côté → D1 saute visuellement.
      //  - leaving : impact au début (idxA) → utiliser offA
      //  - arriving / stuck : impact à la fin (idxB) → utiliser offB
      // ANCRAGE du point de contact, STABLE pour toute la transition :
      //  - arriving : anchor = defB (position stuck à la fin). D1 va vers
      //    le contact, le côté est fixé par où il se retrouvera plaqué.
      //  - leaving : anchor = defA (position stuck au début). D1 quitte
      //    le contact, le côté est fixé par où il était plaqué.
      //  - stuck : anchor = midpoint(defA, defB). D1 est plaqué tout au
      //    long, on prend une moyenne stable.
      // Sans ancrage stable, contactPoint = radialContactPoint(p, screener)
      // flippait quand p traversait l'autre côté du poseur (orbite Bezier
      // ou lerp vers une nouvelle position carrier).
      const anchor = screenMode === 'leaving'
        ? defA[id]
        : screenMode === 'arriving'
          ? defB[id]
          : midpoint(defA[id], defB[id]);
      const contactScreener = screenContactScreenerPoint({
        contact,
        mode: screenMode,
        offA,
        offB,
        stepA: state.steps[idxA],
        stepB: state.steps[idxB],
        ctxA,
        ctxB,
        anchor,
      });
      if (contactScreener) {
        const contactPoint = radialContactPoint(anchor, contactScreener);
        const release = screenContactTangentRelease(localT, modeQuality, screenMode);
        const releasePoint = release > 0
          ? tangentReleasePoint(contactPoint, contactScreener, defB[id], release, modeQuality)
          : contactPoint;
        p = lerpPoint(p, releasePoint, adhesion);
      }
    }
    // Anti-superposition pour défenseurs en screen lock : single-pass
    // pushOutOfMany contre TOUS les attaquants (matched compris, règle
    // absolue cf. PLAYER-CLEARANCE.md). `resolvePlayerCollisions` plus bas
    // skippe ces défenseurs pour éviter le flicker côté-à-côté ; mais
    // l'adhesion peut produire une position à < 34 px d'un attaquant
    // non-matched (typiquement le poseur), il faut compenser ici.
    // Single pass = pas d'oscillation = pas de flicker.
    if (screenLockedDefenders.has(id) || (screenMode && contact.carrierContact) || contact.offBallContact) {
      const obs: Point[] = [];
      for (const aId of attackerIds) obs.push(off[aId]);
      p = pushOutOfMany(p, obs, PLAYER_MIN_CLEARANCE_PX);
    }
    defPos[id] = {
      x: p.x,
      y: p.y,
      late: defB[id].late,
      helpFactor: defB[id].helpFactor,
      isCarrierDefender: defB[id].isCarrierDefender,
      matchedTo: defB[id].matchedTo,
      onScreen: defB[id].onScreen,
      switchedThisStep: defB[id].switchedThisStep,
      closingOut: defB[id].closingOut,
      overClosed: defB[id].overClosed,
      denying: defB[id].denying,
      helpTriggered: defB[id].helpTriggered,
      screenPhase: phase ?? defB[id].screenPhase,
      orientation: lerpAngleDeg(defA[id].orientation, defB[id].orientation, localT),
      gazeOrientation: lerpAngleDeg(defA[id].gazeOrientation, defB[id].gazeOrientation, localT),
      facing: lerpPoint(defA[id].facing, defB[id].facing, localT),
      armBallSide: lerpPoint(defA[id].armBallSide, defB[id].armBallSide, localT),
      armManSide: lerpPoint(defA[id].armManSide, defB[id].armManSide, localT),
    };
  });

  // ---------------------------------------------------------------------
  // 5. Suivi en temps réel des défenseurs sur leur homme + résolution de
  //    collisions strictes + ré-orientation finale.
  // ---------------------------------------------------------------------
  followDefendersAtFrame(defPos, off, carrier, state, idxA, idxB, screenLockedDefenders);
  // Anti-superposition pendant l'interpolation. Les défenseurs "stuck" sur
  // un écran (`screenLockedDefenders`) sont SKIP : leurs positions endpoints
  // (engine) sont déjà à ≥ MIN_CLEARANCE de tous les joueurs ; les pousser
  // ici crée du flicker visuel quand l'obstacle interpolé se déplace.
  // La clearance attaquant↔attaquant est elle gérée plus haut (étape 1.b).
  resolvePlayerCollisions(
    defPos as unknown as Record<string, ComputedDefense[DefenderId]>,
    off,
    PLAYER_MIN_CLEARANCE_PX,
    8,
    screenLockedDefenders
  );
  recomputeDefenseFrameOrientations(state, off, carrier, defPos);

  // 5.b — Rate limiter sur défenseurs : si `options.prevFrame` est fourni
  // (= playback en cours), on clamp le saut max par défenseur à
  // MAX_DEFENDER_JUMP_PX. Évite les snaps visuels mid-segment causés par
  // changements brutaux d'état d'écran / Bezier flips / adhesion blend
  // discontinue. La position rattrape progressivement sur les frames
  // suivantes (~5 frames = 80ms pour 90 px → imperceptible).
  if (options.prevFrame) {
    const prev = options.prevFrame.defPos;
    defenderIds.forEach((id) => {
      const p = prev[id];
      const c = defPos[id];
      if (!p || !c) return;
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > MAX_DEFENDER_JUMP_PX) {
        const k = MAX_DEFENDER_JUMP_PX / d;
        defPos[id].x = p.x + dx * k;
        defPos[id].y = p.y + dy * k;
      }
    });
  }

  // ---------------------------------------------------------------------
  // 6. Ballon — suit la position INTERPOLÉE du porteur (et non les positions
  //    brutes des steps). Sans ça, un dribble avec waypoints fait suivre la
  //    courbe au joueur mais le ballon allait en ligne droite, donnant
  //    l'impression que la balle quitte la main du porteur.
  //    Pour les passes (carrierChanged), on prend les positions interpolées
  //    des deux porteurs (passeur et receveur) — la parabole est correcte.
  // ---------------------------------------------------------------------
  const ball = computeBallFrame(
    off[carrierA] ?? offA[carrierA],
    off[carrierB] ?? offB[carrierB],
    carrierA !== carrierB,
    localT
  );

  return {
    off,
    defPos,
    carrier,
    screen,
    offBallScreens,
    stepIdx: options.stepIdx ?? idxA,
    ballPos: ball.pos,
    ballInFlight: ball.inFlight,
    attVisuals: computeAttackerVisuals(state, idxB),
    attackerIsScreening,
    attackerMovementType,
  };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function plainDefPositions(def: ComputedDefense): Record<DefenderId, Point> {
  const out = {} as Record<DefenderId, Point>;
  (Object.entries(def) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(([id, p]) => {
    out[id] = { x: p.x, y: p.y };
  });
  return out;
}

function radialContactPoint(point: Point, screener: Point): Point {
  const away = { x: point.x - screener.x, y: point.y - screener.y };
  let len = Math.hypot(away.x, away.y);
  if (len < 0.01) {
    away.x = 1;
    away.y = 0;
    len = 1;
  }
  const clearance = PLAYER_MIN_CLEARANCE_PX + 1;
  return {
    x: screener.x + (away.x / len) * clearance,
    y: screener.y + (away.y / len) * clearance,
  };
}

function tangentReleasePoint(
  contactPoint: Point,
  screener: Point,
  target: Point,
  progress: number,
  quality: number
): Point {
  const radial = { x: contactPoint.x - screener.x, y: contactPoint.y - screener.y };
  let radialLen = Math.hypot(radial.x, radial.y);
  if (radialLen < 0.01) {
    radial.x = 1;
    radial.y = 0;
    radialLen = 1;
  }

  const ux = radial.x / radialLen;
  const uy = radial.y / radialLen;
  const tangent = { x: -uy, y: ux };
  const toTarget = { x: target.x - contactPoint.x, y: target.y - contactPoint.y };
  const sign = tangent.x * toTarget.x + tangent.y * toTarget.y >= 0 ? 1 : -1;
  const q = Math.max(0, Math.min(100, quality)) / 100;
  const t = Math.max(0, Math.min(1, progress));
  const tangentDist = PLAYER_MIN_CLEARANCE_PX * (0.35 + q * 0.35);
  const outwardDist = PLAYER_MIN_CLEARANCE_PX * 0.10;

  return {
    x: contactPoint.x + tangent.x * sign * tangentDist * t + ux * outwardDist * t,
    y: contactPoint.y + tangent.y * sign * tangentDist * t + uy * outwardDist * t,
  };
}
