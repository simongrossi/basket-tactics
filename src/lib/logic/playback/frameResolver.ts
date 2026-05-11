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
    const forced = (localT < 0.5 ? a : b).forcedScreener;
    screen = detectScreen(off, carrier, matchups, defPosLinear, state.screenRadius, forced);
    offBallScreens = detectOffBallScreens(off, carrier, matchups, defPosLinear, state.screenRadius);
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
    let p = lerpPoint(defA[id], defB[id], localT);
    const candidates = screenerObstacles.filter((o) => id !== o.defenderToSkip);
    // Le défenseur du porteur qui prend l'écran subit un easing FORT au
    // sommet du contournement, modulé par la qualité de l'écran. Effet :
    // une vraie pause sur l'écran solide/lockdown, le défenseur reste
    // collé au poseur pendant que le porteur se dégage.
    const isCarrierDefenderTakingScreen = defB[id].isCarrierDefender && !!screen;
    const apexSlowness = isCarrierDefenderTakingScreen
      ? carrierApexSlownessFromQuality(carrierScreenQuality)
      : 0.3;
    const pair = pickStaggeredPair(defA[id], defB[id], candidates);
    if (pair) {
      p = curveAroundStaggeredPair(defA[id], defB[id], pair[0], pair[1], localT);
    } else {
      const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
      if (blocking) {
        p = curveAroundObstacle(defA[id], defB[id], blocking.center, blocking.radius, localT, apexSlowness);
      } else if (isCarrierDefenderTakingScreen && carrierScreenObstacle) {
        // Cas où la ligne droite defA→defB ne croise pas formellement le
        // cluster (ex : defB est PILE sur l'écran car D1 a été "late"). On
        // applique quand même la pause si la trajectoire passe à proximité.
        const dx = defB[id].x - defA[id].x;
        const dy = defB[id].y - defA[id].y;
        const len = Math.hypot(dx, dy);
        if (len > 0.01) {
          const ux = dx / len, uy = dy / len;
          const ox = carrierScreenObstacle.center.x - defA[id].x;
          const oy = carrierScreenObstacle.center.y - defA[id].y;
          const proj = ox * ux + oy * uy;
          // Si l'obstacle est "en chemin" et que defB est près du cluster,
          // on force la courbe avec apex slowness max.
          const distToB = Math.hypot(
            defB[id].x - carrierScreenObstacle.center.x,
            defB[id].y - carrierScreenObstacle.center.y,
          );
          if (proj > 0 && distToB < carrierScreenObstacle.radius * 1.3) {
            // Pas de courbe (defB est déjà sur l'obstacle) : on applique
            // seulement le time-remap pour stagner à l'impact. La position
            // reste sur la droite defA→defB, mais avec un easing fort.
            const localTEased = localT + (apexSlowness * Math.sin(2 * Math.PI * localT)) / (2 * Math.PI);
            p = {
              x: defA[id].x + (defB[id].x - defA[id].x) * localTEased,
              y: defA[id].y + (defB[id].y - defA[id].y) * localTEased,
            };
          }
        }
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
