// Actions du porteur : décision (softmax EV), drive, passe (avec
// interceptions actives) et tir forcé.
//
// Extraites de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).

import type { AppState, DefenderId, Point } from '@/lib/types';
import { getDefenseHoop } from '../../engine';
import {
  evaluateOffensiveOptions,
  type OffensiveAction,
} from '../../offense';
import { distance } from '../../geometry';
import { angleDiff } from '../../angles';
import { seededAiRng } from '../aiPossession';
import { triggerRelocateAfterPass } from '../decisions/offBallMover';
import { MAX_CARRIER_STEP_PX } from './constants';
import { ballAt, dist, parabolaArc, refreshDefense } from './helpers';
import type { MatchState } from './types';

export function decideNextAction(
  state: MatchState,
  baseAppState: AppState,
  rng: () => number,
  creativity: number
): OffensiveAction | null {
  const hoop = getDefenseHoop(baseAppState, state.attackingTeam);
  const defAsPoints: Record<DefenderId, Point> = {} as Record<DefenderId, Point>;
  (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
    defAsPoints[id] = { x: state.defPos[id].x, y: state.defPos[id].y };
  });
  const actions = evaluateOffensiveOptions(
    state.off,
    state.defPos,
    state.carrier,
    hoop,
    baseAppState.attackerProfiles,
  );
  if (actions.length === 0) return null;
  return pickActionByEv(actions, rng, creativity);
}

export function pickActionByEv(
  actions: OffensiveAction[],
  rng: () => number,
  creativity: number
): OffensiveAction {
  if (actions.length === 1 || creativity <= 0) return actions[0];
  const temperature = Math.max(0.08, 0.18 + creativity * 0.45);
  const weights = actions.map((a) => Math.exp(a.expectedPoints / temperature));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < actions.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return actions[i];
  }
  return actions[0];
}

export function pickForcedShot(state: MatchState, baseAppState: AppState): OffensiveAction {
  const hoop = getDefenseHoop(baseAppState, state.attackingTeam);
  const actions = evaluateOffensiveOptions(
    state.off,
    state.defPos,
    state.carrier,
    hoop,
    baseAppState.attackerProfiles,
  );
  const shootable = actions.find((a) => a.type === 'shoot');
  if (shootable) return shootable;
  if (actions[0]) return actions[0];
  // Aucune option viable (cas pathologique) : on fabrique un tir forcé
  // à 10 % depuis la position courante. Évite de crasher la loop.
  return {
    type: 'shoot',
    shotPos: state.off[state.carrier] ?? { x: 0, y: 0 },
    expectedPoints: 0.2,
    successRate: 0.1,
    scoreProbability: 0.1,
    shotPoints: 2,
    label: 'tir forcé (aucune option)',
  };
}

export function advanceDrive(
  state: MatchState,
  _dtMs: number,
  baseAppState: AppState
): MatchState {
  if (state.intent.kind !== 'drive') return state;
  const carrierPos = state.off[state.carrier];
  if (!carrierPos) return state;
  const dx = state.intent.target.x - carrierPos.x;
  const dy = state.intent.target.y - carrierPos.y;
  const dist = Math.hypot(dx, dy);
  // Arrivé à destination : résoudre le tir au prochain tick.
  if (dist < 4) {
    state.off[state.carrier] = { ...state.intent.target };
    state.ballPos = ballAt(state.intent.target);
    const action = state.intent.expectedAction;
    state.intent = { kind: 'shoot', action, forced: false };
    refreshDefense(state, baseAppState);
    return state;
  }
  // Sinon, faire un pas borné vers la cible.
  const step = Math.min(dist, MAX_CARRIER_STEP_PX);
  const nx = carrierPos.x + (dx / dist) * step;
  const ny = carrierPos.y + (dy / dist) * step;
  state.off[state.carrier] = { x: nx, y: ny };
  state.ballPos = ballAt({ x: nx, y: ny });
  // Si on a juste un peu bougé, on recompute la défense pour qu'elle
  // suive (V1 simple : à chaque tick. Optim possible plus tard).
  refreshDefense(state, baseAppState);
  return state;
}

export function advancePass(
  state: MatchState,
  _dtMs: number,
  baseAppState: AppState
): MatchState {
  if (state.intent.kind !== 'pass') return state;
  const from = state.off[state.carrier];
  const to = state.off[state.intent.receiver];
  if (!from || !to) return state;
  // Vitesse de passe : on simule en 18 ticks (~600 ms à 30 Hz, comme avant
  // à 5 Hz × 3 ticks).
  const PASS_DURATION_TICKS = 18;
  const newProgress = state.intent.progress + 1 / PASS_DURATION_TICKS;
  if (newProgress >= 1) {
    // Passe arrivée : nouveau porteur.
    const action = state.intent.expectedAction;
    // RNG seedée pour déterminisme (avant : Math.random() = non-reproductible).
    const passRng = seededAiRng(state.seed + state.tickCount * 31 + 1);
    const passLost = newProgress > 1.5 ? false : passRng() > action.successRate;
    if (passLost) {
      state.outcome = 'turnover-pass';
      // Phase 1.4 — Compte le turnover sur l'équipe qui passait.
      state.teamStats = {
        ...state.teamStats,
        [state.attackingTeam]: {
          ...state.teamStats[state.attackingTeam],
          turnovers: state.teamStats[state.attackingTeam].turnovers + 1,
        },
      };
      state.eventLog.push({
        possession: state.possession,
        clock: state.shotClockMs / 1000,
        actor: state.carrier,
        targetId: state.intent.receiver,
        type: 'turnover',
        label: `Passe perdue ${state.carrier}→${state.intent.receiver}`,
      });
      state.intent = { kind: 'idle' };
      return state;
    }
    const previousCarrier = state.carrier;
    const newCarrier = state.intent.receiver;
    state.carrier = newCarrier;
    state.ballPos = ballAt(to);
    state.eventLog.push({
      possession: state.possession,
      clock: state.shotClockMs / 1000,
      actor: previousCarrier,
      targetId: newCarrier,
      type: 'pass',
      label: `Passe ${previousCarrier}→${newCarrier}`,
    });
    state.intent = { kind: 'idle' };
    // B2 — l'ancien porteur relocate vers son slot vacant.
    const relocate = triggerRelocateAfterPass({
      previousCarrier,
      newCarrier,
      off: state.off,
      hoop: getDefenseHoop(baseAppState, state.attackingTeam),
      attackerProfiles: baseAppState.attackerProfiles,
    });
    if (relocate) {
      state.offBallIntents = { ...state.offBallIntents, [previousCarrier]: relocate };
    }
    // Le nouveau porteur ne doit plus avoir d'intent off-ball.
    if (state.offBallIntents[newCarrier]) {
      const cleaned = { ...state.offBallIntents };
      delete cleaned[newCarrier];
      state.offBallIntents = cleaned;
    }
    refreshDefense(state, baseAppState);
    return state;
  }
  // Passe en cours : la balle vole.
  state.intent = { ...state.intent, progress: newProgress };
  const ballX = from.x + (to.x - from.x) * newProgress;
  const ballYProj = from.y + (to.y - from.y) * newProgress;
  const zVal = parabolaArc(newProgress, dist(from, to));

  if (baseAppState.activeInterceptionsEnabled && zVal <= 55) {
    const defenderIds = Object.keys(state.defPos) as DefenderId[];
    for (const dId of defenderIds) {
      const def = state.defPos[dId];
      if (!def) continue;
      const d2d = distance({ x: def.x, y: def.y }, { x: ballX, y: ballYProj });
      if (d2d <= 24) {
        const dx = ballX - def.x;
        const dy = ballYProj - def.y;
        const angleToBall = (Math.atan2(dx, -dy) * 180) / Math.PI;
        const gaze = def.gazeOrientation ?? 0;
        const diff = Math.abs(angleDiff(gaze, angleToBall));
        if (diff <= 90) {
          const interceptRng = seededAiRng(state.seed + state.tickCount * 47 + 7);
          if (interceptRng() < 0.12) {
            state.outcome = 'turnover-pass';
            state.teamStats = {
              ...state.teamStats,
              [state.attackingTeam]: {
                ...state.teamStats[state.attackingTeam],
                turnovers: state.teamStats[state.attackingTeam].turnovers + 1,
              },
            };
            state.eventLog.push({
              possession: state.possession,
              clock: state.shotClockMs / 1000,
              actor: state.carrier,
              targetId: state.intent.receiver,
              type: 'turnover',
              label: `Interception par ${dId} sur la passe ${state.carrier}→${state.intent.receiver}`,
            });
            state.ballPos = { x: def.x, y: def.y, z: 0 };
            state.intent = { kind: 'idle' };
            return state;
          }
        }
      }
    }
  }

  state.ballPos = {
    x: ballX,
    y: ballYProj - zVal,
    z: zVal,
  };
  return state;
}
