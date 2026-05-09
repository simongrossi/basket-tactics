import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Matchups,
  PlayerCount,
  Step,
} from '../types';
import { baseMatchups, initialDef, initialOff } from '../data/initial';

export const ALL_ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
export const ALL_DEFENDER_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
export const PLAYER_COUNT_OPTIONS: PlayerCount[] = [2, 3, 4, 5];

export function normalizePlayerCount(count: unknown): PlayerCount {
  return PLAYER_COUNT_OPTIONS.includes(count as PlayerCount)
    ? count as PlayerCount
    : 5;
}

export function getActiveAttackerIds(count: unknown): AttackerId[] {
  return ALL_ATTACKER_IDS.slice(0, normalizePlayerCount(count));
}

export function getActiveDefenderIds(count: unknown): DefenderId[] {
  return ALL_DEFENDER_IDS.slice(0, normalizePlayerCount(count));
}

export function isActiveAttacker(id: AttackerId | null | undefined, count: unknown): id is AttackerId {
  return !!id && getActiveAttackerIds(count).includes(id);
}

export function isActiveDefender(id: DefenderId | null | undefined, count: unknown): id is DefenderId {
  return !!id && getActiveDefenderIds(count).includes(id);
}

export function activeBallCarrier(step: Step, count: unknown): AttackerId {
  return isActiveAttacker(step.ballCarrier, count) ? step.ballCarrier : getActiveAttackerIds(count)[0];
}

export function activeOffense(off: AttackerPositions, count: unknown): AttackerPositions {
  const out = {} as AttackerPositions;
  getActiveAttackerIds(count).forEach((id) => {
    out[id] = off[id] ?? initialOff[id];
  });
  return out;
}

export function activeDefenseInitial(defenseInitial: DefenderPositions, count: unknown): DefenderPositions {
  const out = {} as DefenderPositions;
  getActiveDefenderIds(count).forEach((id) => {
    out[id] = defenseInitial[id] ?? initialDef[id];
  });
  return out;
}

export function activeMatchups(count: unknown): Matchups {
  const out = {} as Matchups;
  getActiveDefenderIds(count).forEach((dId) => {
    out[dId] = baseMatchups[dId];
  });
  return out;
}

export function normalizeStateForPlayerCount(state: AppState, count: PlayerCount): AppState {
  const playerCount = normalizePlayerCount(count);
  const steps = state.steps.map((step) => ({
    ...step,
    ballCarrier: activeBallCarrier(step, playerCount),
    forcedScreener: isActiveAttacker(step.forcedScreener, playerCount)
      ? step.forcedScreener
      : undefined,
  }));
  return { ...state, playerCount, steps };
}
