// Résolution du tir : outcome, stats, événement HUD, box-out, pré-calcul
// du rebond et trajectoire physique 3D optionnelle.
//
// Extraite de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).

import type { AppState, AttackerId, DefenderId, Point } from '@/lib/types';
import { getDefenseHoop } from '../../engine';
import { nearestDefenderDistance, type OffensiveAction } from '../../offense';
import { shotZoneFor } from '../../threats';
import { distance } from '../../geometry';
import { seededAiRng } from '../aiPossession';
import {
  computeRebound,
  type ReboundParticipant,
  type ReboundType,
} from '../rebound';
import { CONTEST_THRESHOLD_PX, SHOT_ZONE_LABELS } from './constants';
import { computeBoxOutTargets } from './helpers';
import type { MatchState } from './types';

export function generatePhysicalShotTrajectory(
  startPos: Point,
  hoop: Point,
  made: boolean,
  seed: number
): Point[] {
  const trajectory: Point[] = [];
  const dt = 10; // 10 ms steps
  const totalDuration = 1500; // 1500 ms total
  const numSteps = totalDuration / dt; // 150 steps

  const g = 0.0008; // px/ms^2
  const t_hoop = 700; // time to reach the hoop in ms

  // Initial position
  let x = startPos.x;
  let y = startPos.y;
  let z = startPos.z ?? 15; // default release height 15px

  // Target position at t_hoop
  let tx = hoop.x;
  let ty = hoop.y;
  let tz = 50;

  // Restitution coefficients
  const e_rim = 0.6;
  const e_board = 0.5;
  const e_ground = 0.65;
  const ball_radius = 4.5;

  const rng = seededAiRng(seed);

  if (!made) {
    // Add small random offsets so it misses and hits the ring or backboard
    // Use rng to be deterministic
    const offsetAngle = rng() * 2 * Math.PI;
    // We want the offset to be such that it often hits the rim (radius 8) or backboard.
    // So let's distribute the offset distance between 6 and 16 px.
    const offsetDist = 6 + rng() * 10;
    tx += Math.cos(offsetAngle) * offsetDist;
    ty += Math.sin(offsetAngle) * offsetDist;
    tz += (rng() - 0.5) * 6; // small height variation
  }

  // Calculate initial velocities to hit the target (tx, ty, tz) at t_hoop
  let vx = (tx - x) / t_hoop;
  let vy = (ty - y) / t_hoop;
  let vz = (tz - z + 0.5 * g * t_hoop * t_hoop) / t_hoop;

  const backboardY = hoop.y + (hoop.y < 300 ? -10 : 10);
  const backboardMinX = hoop.x - 30;
  const backboardMaxX = hoop.x + 30;
  const backboardMinZ = 50;
  const backboardMaxZ = 85;

  for (let step = 0; step < numSteps; step++) {
    const t = step * dt;
    trajectory.push({ x, y, z });

    // If made shot and we reached or passed the hoop time, drop it straight down through the net
    if (made && t >= t_hoop) {
      // Just fall down with gravity or slow downward speed
      vx = 0;
      vy = 0;
      vz = Math.max(-0.15, vz - g * dt);
      x = hoop.x;
      y = hoop.y;
      z = Math.max(0, z + vz * dt);
      continue;
    }

    // Apply gravity
    vz -= g * dt;

    // Save previous coordinates to detect crossing the backboard plane
    const prevY = y;

    // Update positions
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    // Collision with backboard plane
    // The backboard is at y = backboardY. Check if we crossed it.
    const crossedBackboard = (prevY < backboardY && y >= backboardY) || (prevY > backboardY && y <= backboardY);
    if (crossedBackboard) {
      // Check bounds
      if (x >= backboardMinX && x <= backboardMaxX && z >= backboardMinZ && z <= backboardMaxZ) {
        // Bounce!
        y = backboardY; // push out
        vy = -vy * e_board;
        // Add a tiny random deflection
        vx += (rng() - 0.5) * 0.05;
        vz += (rng() - 0.5) * 0.05;
      }
    }

    // Collision with arceau ring (torus)
    // Ring centered at (hoop.x, hoop.y, 50) with radius 8
    const dx = x - hoop.x;
    const dy = y - hoop.y;
    const dist2d = Math.hypot(dx, dy);
    if (dist2d > 0.01) {
      // Closest point on the ring
      const rx = hoop.x + (dx / dist2d) * 8;
      const ry = hoop.y + (dy / dist2d) * 8;
      const rz = 50;

      const dist3d = Math.hypot(x - rx, y - ry, z - rz);
      if (dist3d < ball_radius) {
        // Collision normal
        const nx = (x - rx) / dist3d;
        const ny = (y - ry) / dist3d;
        const nz = (z - rz) / dist3d;

        const dot = vx * nx + vy * ny + vz * nz;
        if (dot < 0) {
          // Reflect velocity
          vx = vx - (1 + e_rim) * dot * nx;
          vy = vy - (1 + e_rim) * dot * ny;
          vz = vz - (1 + e_rim) * dot * nz;

          // Push out
          x = rx + nx * ball_radius;
          y = ry + ny * ball_radius;
          z = rz + nz * ball_radius;
        }
      }
    }

    // Collision with ground
    if (z <= 0) {
      z = 0;
      if (vz < 0) {
        vz = -vz * e_ground;
        // Friction on ground
        vx *= 0.8;
        vy *= 0.8;

        if (vz < 0.05) {
          vz = 0;
        }
      }
    }
  }

  return trajectory;
}

export function resolveShot(
  state: MatchState,
  action: OffensiveAction,
  rng: () => number,
  forced: boolean,
  baseAppState: AppState
): MatchState {
  const made = rng() < action.scoreProbability;
  const points = made ? action.shotPoints : 0;
  state.score = points;
  state.outcome = made
    ? forced
      ? 'forced-shot-made'
      : 'shot-made'
    : forced
      ? 'forced-shot-missed'
      : 'shot-missed';

  // Phase 1.4 — Stats équipe : agrège ce tir sur l'équipe qui attaque.
  const team = state.attackingTeam;
  state.teamStats = {
    ...state.teamStats,
    [team]: {
      ...state.teamStats[team],
      points: state.teamStats[team].points + points,
      fgMade: state.teamStats[team].fgMade + (made ? 1 : 0),
      fgAttempted: state.teamStats[team].fgAttempted + 1,
    },
  };

  // B3a — métadonnées de tir enrichies : zone, contestation, position.
  // On reprend les mêmes helpers que `evaluateOffensiveOptions` pour
  // garantir la cohérence avec le `scoreProbability` déjà calculé.
  const hoop = getDefenseHoop(baseAppState, state.attackingTeam);
  const distFromHoop = distance(action.shotPos, hoop);
  const shotZone = shotZoneFor(distFromHoop);
  const contestDistance = nearestDefenderDistance(action.shotPos, state.defPos);
  const contested = contestDistance <= CONTEST_THRESHOLD_PX;

  const verb = forced ? 'Tir forcé' : 'Tir';
  const contestSuffix = contested ? ' contesté' : '';
  const zoneSuffix = SHOT_ZONE_LABELS[shotZone];
  const pctText = `${Math.round(action.scoreProbability * 100)} %`;
  const label = `${verb} ${state.carrier} ${zoneSuffix}${contestSuffix} (${pctText})`;

  state.eventLog.push({
    possession: state.possession,
    clock: state.shotClockMs / 1000,
    actor: state.carrier,
    type: forced ? 'forced-shot' : 'shot',
    label,
    expectedPoints: action.expectedPoints,
    scoreProbability: action.scoreProbability,
    points,
    shotZone,
    contestDistance,
    contested,
    shotPos: { ...action.shotPos },
    shotPointsAttempted: action.shotPoints,
  });
  state.intent = { kind: 'idle' };
  // Box-Out V2 — au lieu de snapper instantanément les défenseurs sur
  // leurs positions de box-out, on POSE les cibles et on laisse
  // handleTransitionPause animer le déplacement sur BOXOUT_ANIMATION_MS.
  state.boxOutTargets = computeBoxOutTargets(state, hoop);
  state.boxOutStartedAtMs = state.possessionTimeMs;
  // E.3 — pré-calcul du rebond pour animer le ballon pendant la pause.
  // Sur tir manqué uniquement : on appelle computeRebound MAINTENANT
  // pour connaître la position d'arrivée du ballon. Sur tir réussi, le
  // ballon reste au cercle (pas de rebond).
  const carrierPos = state.off[state.carrier];
  const startPos = carrierPos ? { ...carrierPos } : { ...action.shotPos };
  state.shotBallStartPos = startPos;

  if (baseAppState.physicsReboundsEnabled) {
    const traj = generatePhysicalShotTrajectory(
      startPos,
      hoop,
      made,
      state.seed + state.tickCount * 17 + 3
    );
    state.shotPhysicalTrajectory = traj;

    if (!made) {
      // Trouver le point de chute dans la trajectoire (z <= 0 après la montée / après le hoop)
      // Parcourons à partir de l'index 70 (qui correspond à 700 ms, après le passage au cercle)
      let landingSpot = hoop;
      for (let i = 70; i < traj.length; i++) {
        if (traj[i].z === 0 || traj[i].z! <= 0) {
          landingSpot = traj[i];
          break;
        }
      }
      if (landingSpot === hoop && traj.length > 0) {
        landingSpot = traj[traj.length - 1];
      }
      const landingPos = { x: landingSpot.x, y: landingSpot.y };

      // Trouver le joueur le plus proche
      let closestPlayer: ReboundParticipant | null = null;
      let minDistance = Infinity;
      (Object.keys(state.off) as AttackerId[]).forEach((id) => {
        const p = state.off[id];
        if (!p) return;
        const d = distance(p, landingPos);
        if (d < minDistance) {
          minDistance = d;
          closestPlayer = id as ReboundParticipant;
        }
      });
      (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
        const p = state.defPos[id];
        if (!p) return;
        const d = distance({ x: p.x, y: p.y }, landingPos);
        if (d < minDistance) {
          minDistance = d;
          closestPlayer = id as ReboundParticipant;
        }
      });

      const type: ReboundType =
        closestPlayer !== null && (closestPlayer as string).startsWith('O')
          ? 'offensive'
          : 'defensive';
      state.pendingRebound = {
        rebounder: closestPlayer,
        type,
        weights: {},
        position: landingPos,
      };
    } else {
      state.pendingRebound = null;
    }
  } else {
    state.shotPhysicalTrajectory = null;
    if (!made) {
      const reboundRng = seededAiRng(state.seed + state.tickCount * 17 + 3);
      state.pendingRebound = computeRebound({
        off: state.off,
        defPos: state.defPos,
        hoop,
        shotPos: action.shotPos,
        attackerProfiles: baseAppState.attackerProfiles,
        shooter: state.carrier,
        rng: reboundRng,
      });
    } else {
      state.pendingRebound = null;
    }
  }
  return state;
}
