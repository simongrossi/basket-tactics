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
 * Mappe la qualité d'écran (0-100) sur le paramètre `apexSlowness` passé à
 * `curveAroundObstacle` pour le défenseur du porteur :
 *  - 0 (ghost)    → 0.30 (comportement par défaut, juste un frôlement)
 *  - 50 (std)     → 0.75 (ralentissement marqué au sommet)
 *  - 100 (lockdown) → 0.98 (quasi-pause, D1 reste collé au poseur)
 *
 * Choix : courbe linéaire entre 0.30 et 0.98. À 50 (défaut), on est déjà à
 * 0.75 — visuellement le défenseur stagne nettement à l'impact.
 */
function carrierApexSlownessFromQuality(quality: number): number {
  const q = Math.max(0, Math.min(100, quality));
  return 0.30 + (q / 100) * (0.98 - 0.30);
}

/**
 * Largeur du "freeze" (en fraction de la transition) appliquée à D1 quand
 * il prend ou quitte un écran. Modulé par la qualité :
 *  - 0   (ghost)    → 0 (pas de freeze, lerp normal)
 *  - 50  (std)      → 0.30 (30% de la transition figé sur le poseur)
 *  - 100 (lockdown) → 0.55 (plus de la moitié de la transition figé)
 */
function freezeWidthFromQuality(quality: number): number {
  const q = Math.max(0, Math.min(100, quality)) / 100;
  return q * 0.55;
}

/**
 * Remappe localT pour figer D1 à l'extrémité appropriée pendant la phase de
 * contact écran. Deux modes :
 *  - 'arriving' : D1 rejoint le poseur (defB est sur l'écran). Il y arrive
 *    rapidement (compression de la première portion) puis y reste figé.
 *  - 'leaving' : D1 quitte le poseur en recovery (defA est sur l'écran).
 *    Il reste figé au départ puis rattrape rapidement.
 * Sans screen ou freezeWidth=0 → lerp linéaire identique.
 */
function screenContactT(
  localT: number,
  freezeWidth: number,
  mode: 'arriving' | 'leaving' | null
): number {
  if (!mode || freezeWidth <= 0) return localT;
  const w = Math.min(0.9, freezeWidth);
  if (mode === 'arriving') {
    // Compresse [0, 1-w] → [0, 1], puis plateau à 1 sur [1-w, 1].
    const active = 1 - w;
    return localT < active ? localT / active : 1;
  }
  // leaving : plateau à 0 sur [0, w], puis compresse [w, 1] → [0, 1].
  return localT > w ? (localT - w) / (1 - w) : 0;
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
  const carrier = localT < 0.5
    ? activeBallCarrier(a, state.playerCount)
    : activeBallCarrier(b, state.playerCount);
  let screen: ReturnType<typeof detectScreen> = null;
  let offBallScreens: DetectedOffBallScreen[] = [];
  if (state.defenseSystem === 'man') {
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
  // Cluster d'écran "principal" (porteur) — utilisé pour appliquer une pause
  // au défenseur du porteur en fonction de la qualité de l'écran.
  let carrierScreenObstacle: ScreenerObstacle | null = null;
  let carrierScreenQuality = 50;
  if (screen) {
    const sPos = midpoint(offA[screen.screener], offB[screen.screener]);
    const sDef = midpoint(defA[screen.screenerDef], defB[screen.screenerDef]);
    const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
    screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef });
    carrierScreenObstacle = { center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef };
    // Cherche la qualité dans l'annotation source (step idxB ou idxA).
    const candidates = [state.steps[idxB], state.steps[idxA]];
    for (const st of candidates) {
      if (!st) continue;
      const sa = st.annotations.find((aa) => aa.type === 'screen' && aa.fromId === screen.screener);
      if (sa) {
        carrierScreenQuality = sa.quality ?? 50;
        break;
      }
    }
  }
  offBallScreens.forEach((s) => {
    const sPos = midpoint(offA[s.screener], offB[s.screener]);
    const sDef = midpoint(defA[s.screenerDef], defB[s.screenerDef]);
    const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
    screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: s.screenerDef });
  });

  // ---------------------------------------------------------------------
  // 4. Positions défenseurs — interpolation linéaire + courbe d'évitement.
  // ---------------------------------------------------------------------
  const defPos = {} as ComputedDefense;
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
    const aOn = !!defA[id].onScreen && isCarrierDef;
    const bOn = !!defB[id].onScreen && isCarrierDef;
    let screenMode: 'arriving' | 'leaving' | 'stuck' | null = null;
    if (aOn && bOn) screenMode = 'stuck';
    else if (!aOn && bOn) screenMode = 'arriving';
    else if (aOn && !bOn) screenMode = 'leaving';

    // Qualité d'écran applicable : lit l'annotation 'screen' sur le step
    // pertinent. Pour 'leaving', c'est l'annotation du step idxA ; pour
    // 'arriving'/'stuck', celle de idxB (sinon idxA en fallback).
    let modeQuality = 50;
    if (screenMode) {
      const lookupSteps = screenMode === 'leaving'
        ? [state.steps[idxA]]
        : [state.steps[idxB], state.steps[idxA]];
      for (const st of lookupSteps) {
        if (!st) continue;
        const sa = st.annotations.find((aa) => aa.type === 'screen');
        if (sa) { modeQuality = sa.quality ?? 50; break; }
      }
    }
    const freezeWidth = freezeWidthFromQuality(modeQuality);

    // Time-remap qui FIGE D1 sur le poseur pendant une fraction de la
    // transition (proportionnelle à la qualité d'écran). Pour les autres
    // défenseurs ou hors écran, eased identique à localT.
    const effT = screenMode === 'stuck'
      // Stuck = freeze au milieu : compresse [0, 0.5] → [0, mid-w/2], plateau, etc.
      ? (localT < 0.5 - freezeWidth / 2
          ? (localT / (0.5 - freezeWidth / 2)) * 0.5
          : localT > 0.5 + freezeWidth / 2
            ? 0.5 + ((localT - (0.5 + freezeWidth / 2)) / (0.5 - freezeWidth / 2)) * 0.5
            : 0.5)
      : screenContactT(localT, freezeWidth, screenMode);

    let p = lerpPoint(defA[id], defB[id], effT);

    // Le défenseur du porteur qui prend l'écran subit un easing FORT au
    // sommet du contournement quand sa ligne croise un cluster, modulé par
    // la qualité de l'écran. Cumulé avec le freeze ci-dessus pour des
    // transitions vraiment palpables.
    const isCarrierDefenderTakingScreen = defB[id].isCarrierDefender && !!screen;
    const apexSlowness = isCarrierDefenderTakingScreen
      ? carrierApexSlownessFromQuality(carrierScreenQuality)
      : 0.3;
    const pair = pickStaggeredPair(defA[id], defB[id], candidates);
    if (pair) {
      p = curveAroundStaggeredPair(defA[id], defB[id], pair[0], pair[1], effT);
    } else {
      const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
      if (blocking) {
        p = curveAroundObstacle(defA[id], defB[id], blocking.center, blocking.radius, effT, apexSlowness);
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
  followDefendersAtFrame(defPos, off, carrier, state, idxA, idxB);
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
  const carrierA = activeBallCarrier(a, state.playerCount);
  const carrierB = activeBallCarrier(b, state.playerCount);
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
