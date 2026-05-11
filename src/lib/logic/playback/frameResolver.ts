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
import { detectOffBallScreens, detectScreen } from '../screens';
import {
  computeBallFrame,
  curveAroundObstacle,
  curveAroundStaggeredPair,
  makeCluster,
  pickBlockingCluster,
  pickStaggeredPair,
  resolvePlayerCollisions,
} from '../geometry';
import { activeBallCarrier, activeOffense } from '../players';
import { attackerTrajectoryAt, type MovementType } from '../playbackTrajectory';
import { lerpAngleDeg } from '../angles';
import { buildStep0DetectionPositions } from '../step0Detection';
import {
  PLAYER_CLUSTER_BASE_R_PX,
  PLAYER_CLUSTER_LINK_DIST_PX,
  PLAYER_MIN_CLEARANCE_PX,
  PLAYER_OBSTACLE_RADIUS_PX,
} from '@/lib/data/court';
import {
  carrierApexSlownessFromQuality,
  carrierScreenRoutePreference,
  contactQualityForRule,
  effectiveScreenRuleForDef,
  findScreenQuality,
  forcedPushSignForRoute,
  offBallScreenRoutePreference,
  screenContactAdhesion,
  screenContactPhase,
  screenContactT,
  type ScreenContactMode,
} from '../screenPhysics';

export interface PlaybackFrame {
  off: AttackerPositions;
  defPos: ComputedDefense;
  carrier: AttackerId;
  screen: ReturnType<typeof detectScreen>;
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
}

interface ScreenerObstacle {
  center: Point;
  radius: number;
  defenderToSkip: DefenderId;
}

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

    if (traj.movementType === 'cut' || traj.movementType === 'idle') {
      const obstacles: ScreenerObstacle[] = [];
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

  // ---------------------------------------------------------------------
  // 2. Porteur courant + détection d'écrans (uniquement en man-to-man).
  // ---------------------------------------------------------------------
  const carrierA = activeBallCarrier(a, state.playerCount);
  const carrierB = activeBallCarrier(b, state.playerCount);
  let screenA: ReturnType<typeof detectScreen> = null;
  let screenB: ReturnType<typeof detectScreen> = null;
  let offBallScreensA: DetectedOffBallScreen[] = [];
  let offBallScreensB: DetectedOffBallScreen[] = [];
  const carrier = localT < 0.5
    ? carrierA
    : carrierB;
  let screen: ReturnType<typeof detectScreen> = null;
  let offBallScreens: DetectedOffBallScreen[] = [];
  if (state.defenseSystem === 'man') {
    const matchupsA = getMatchupsAt(state.steps, Math.max(0, idxA - 1), state.playerCount);
    const matchupsB = getMatchupsAt(state.steps, Math.max(0, idxB - 1), state.playerCount);
    const defPlainA = plainDefPositions(defA);
    const defPlainB = plainDefPositions(defB);
    screenA = detectScreen(offA, carrierA, matchupsA, defPlainA, state.screenRadius, a.forcedScreener);
    screenB = detectScreen(offB, carrierB, matchupsB, defPlainB, state.screenRadius, b.forcedScreener);
    offBallScreensA = detectOffBallScreens(offA, carrierA, matchupsA, defPlainA, state.screenRadius);
    offBallScreensB = detectOffBallScreens(offB, carrierB, matchupsB, defPlainB, state.screenRadius);

    const matchups = getMatchupsAt(state.steps, Math.max(0, idxB - 1), state.playerCount);
    const defPosLinear = {} as Record<DefenderId, Point>;
    defenderIds.forEach((id) => {
      defPosLinear[id] = lerpPoint(defA[id], defB[id], localT);
    });
    // À step 0 en édition libre : si un défenseur est "late" (bloqué loin de
    // sa cible à cause d'un écran), sa position linéaire ne sera pas dans le
    // rayon de détection autour du poseur. On substitue alors par sa cible
    // homme-à-homme pour que l'indicateur d'écran continue à s'afficher.
    const detectionPos: Record<DefenderId, Point> = (idxA === 0 && idxB === 0)
      ? buildStep0DetectionPositions(state, off, carrier, matchups, defPosLinear)
      : defPosLinear;
    const forced = (localT < 0.5 ? a : b).forcedScreener;
    screen = detectScreen(off, carrier, matchups, detectionPos, state.screenRadius, forced);
    offBallScreens = detectOffBallScreens(off, carrier, matchups, detectionPos, state.screenRadius);
  }

  // ---------------------------------------------------------------------
  // 3. Obstacles "cluster" (poseur + son défenseur) pour contourner les
  //    écrans pendant le segment. Position MOYENNE A↔B → obstacle stable.
  // ---------------------------------------------------------------------
  const screenerObstacles: ScreenerObstacle[] = [];
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
  const seenScreenerDefs = new Set<DefenderId>();
  const addClusterFromScreen = (
    screenerId: AttackerId,
    screenerDef: DefenderId
  ) => {
    if (seenScreenerDefs.has(screenerDef)) return;
    seenScreenerDefs.add(screenerDef);
    const sPos = midpoint(offA[screenerId], offB[screenerId]);
    const sDef = midpoint(defA[screenerDef], defB[screenerDef]);
    const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
    screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screenerDef });
  };
  if (screenA) addClusterFromScreen(screenA.screener, screenA.screenerDef);
  if (screenB) addClusterFromScreen(screenB.screener, screenB.screenerDef);
  offBallScreensA.forEach((s) => addClusterFromScreen(s.screener, s.screenerDef));
  offBallScreensB.forEach((s) => addClusterFromScreen(s.screener, s.screenerDef));

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
    const isCarrierDef = defB[id].isCarrierDefender || defA[id].isCarrierDefender;
    const carrierContactA = screenA?.carrierDef === id;
    const carrierContactB = screenB?.carrierDef === id;
    const offBallContactA = offBallScreensA.find((s) => s.cutterDef === id);
    const offBallContactB = offBallScreensB.find((s) => s.cutterDef === id);
    const offBallContact = offBallContactB ?? offBallContactA;
    // Détection STABLE basée uniquement sur les endpoints A/B. On exclut
    // `screen`/`offBallScreens` (détections courantes interpolées) qui
    // peuvent fire/unfire pendant le scrub si D1 et le poseur se croisent
    // mid-segment — créant un flicker de screenMode → de effT → de
    // l'adhésion → D1 saute visuellement.
    const carrierContact = isCarrierDef && (carrierContactA || carrierContactB);
    const aOn = carrierContactA || !!offBallContactA;
    const bOn = carrierContactB || !!offBallContactB;
    let screenMode: ScreenContactMode | null = null;
    if (carrierContact || offBallContact) {
      if (aOn && bOn) screenMode = 'stuck';
      else if (!aOn && bOn) screenMode = 'arriving';
      else if (aOn && !bOn) screenMode = 'leaving';
    }

    // Qualité d'écran applicable : lit l'annotation 'screen' sur le step
    // pertinent. Pour 'leaving', c'est l'annotation du step idxA ; pour
    // 'arriving'/'stuck', celle de idxB (sinon idxA en fallback).
    let modeQuality = 50;
    if (screenMode) {
      const lookupSteps = screenMode === 'leaving'
        ? [state.steps[idxA]]
        : [state.steps[idxB], state.steps[idxA]];
      const contactScreen = screenMode === 'leaving'
        ? screenA
        : screenB ?? screen ?? screenA;
      const screenerId = offBallContact?.screener ?? (contactScreen?.carrierDef === id ? contactScreen.screener : undefined);
      modeQuality = findScreenQuality(lookupSteps, screenerId);
      if (carrierContact) {
        modeQuality = contactQualityForRule(modeQuality, effectiveScreenRuleForDef(state, id), screenMode);
      }
    }
    // Time-remap sigmoïdal qui FIGE D1 sur le poseur (smooth, sans
    // discontinuité de vélocité). Pour les autres défenseurs ou hors
    // écran, identité = localT.
    const effT = screenContactT(localT, modeQuality, screenMode);
    const phase = screenContactPhase(screenMode, localT, modeQuality);
    if (screenMode) {
      // Verrouille ce défenseur contre followDefendersAtFrame pour préserver
      // l'effet visuel du contact (freeze, courbe, easing).
      screenLockedDefenders.add(id);
    } else if (isCarrierDef && hasScreenAnnotationFor(a, carrierA, id) ||
               isCarrierDef && hasScreenAnnotationFor(b, carrierB, id)) {
      // Verrou supplémentaire : si l'utilisateur a DESSINÉ une annotation
      // 'screen' sur step A ou B mais que la géométrie ne l'a pas détectée
      // (poseur loin de D1 aux endpoints, ex systeme_basket-8 où O3 slip
      // de 140px pendant le segment), on verrouille quand même D1 contre
      // followDefendersAtFrame. Sinon D1 colle O1 en temps réel, croise
      // O3 mid-segment, et le résolveur de collisions le flippe d'un côté
      // à l'autre → saut visuel inexpliqué. Pas de mode/freeze/courbe
      // appliqué (la détection moteur a manqué), juste la stabilisation.
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
      : offBallContact
        ? offBallScreenRoutePreference(offBallContact, state.offBallScreenRule, off[carrier])
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
    if (adhesion > 0) {
      // Position du poseur FIGÉE au moment du contact (pas l'interpolation
      // courante). En basket réel, D1 reste où il s'est fait bumper — il
      // ne suit pas le poseur qui slip ou roll après l'impact. Sans cet
      // ancrage, si le poseur traverse l'axe defA→defB pendant le segment,
      // contactPoint flip de côté → D1 saute visuellement.
      //  - leaving : impact au début (idxA) → utiliser offA
      //  - arriving / stuck : impact à la fin (idxB) → utiliser offB
      const contactOff = screenMode === 'leaving' ? offA : offB;
      const contactScreener = carrierContactScreener(
        id,
        screenMode === 'leaving' ? screenA : (screenB ?? screenA),
        contactOff
      ) ?? offBallContactScreener(
        screenMode === 'leaving' ? offBallContactA : (offBallContactB ?? offBallContactA),
        contactOff
      ) ?? annotationScreenerPoint(
        screenMode === 'leaving' ? [state.steps[idxA]] : [state.steps[idxB], state.steps[idxA]],
        contactOff
      );
      if (contactScreener) {
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
        const contactPoint = radialContactPoint(anchor, contactScreener);
        p = lerpPoint(p, contactPoint, adhesion);
      }
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
  resolvePlayerCollisions(
    defPos as unknown as Record<string, ComputedDefense[DefenderId]>,
    off,
    PLAYER_MIN_CLEARANCE_PX
  );
  recomputeDefenseFrameOrientations(state, off, carrier, defPos);

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

/**
 * Si l'utilisateur a dessiné une annotation 'screen' dans `step` ciblant
 * `carrier` (toId ou implicite), retourne l'attaquant qui en est le poseur.
 */
function annotationScreenerFor(
  step: AppState['steps'][number] | undefined,
  carrier: AttackerId
): AttackerId | undefined {
  if (!step) return undefined;
  const ann = step.annotations.find(
    (a) => a.type === 'screen' && a.fromId !== carrier && (a.toId == null || a.toId === carrier)
  );
  return ann?.fromId;
}

/**
 * Vrai si l'utilisateur a dessiné une annotation 'screen' dans `step` pour
 * le défenseur `defenderId` (= carrierDef du carrier). Sert à stabiliser le
 * défenseur du porteur contre followDefendersAtFrame quand la géométrie ne
 * détecte pas formellement l'écran.
 */
function hasScreenAnnotationFor(
  step: AppState['steps'][number] | undefined,
  carrier: AttackerId,
  _defenderId: DefenderId
): boolean {
  return annotationScreenerFor(step, carrier) !== undefined;
}

function carrierContactScreener(
  defenderId: DefenderId,
  screen: ReturnType<typeof detectScreen>,
  off: AttackerPositions
): Point | null {
  if (!screen || screen.carrierDef !== defenderId) return null;
  const screener = off[screen.screener];
  return screener ?? null;
}

function offBallContactScreener(
  screen: DetectedOffBallScreen | undefined,
  off: AttackerPositions
): Point | null {
  if (!screen) return null;
  return off[screen.screener] ?? screen.screenerPos;
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

function annotationScreenerPoint(
  steps: Array<AppState['steps'][number] | undefined>,
  off: AttackerPositions
): Point | null {
  for (const st of steps) {
    const ann = st?.annotations.find((a) => a.type === 'screen');
    if (!ann) continue;
    const id = ann.fromId as AttackerId;
    return off[id] ?? ann.to ?? ann.from;
  }
  return null;
}
