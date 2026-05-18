// Phase 1.4 — Stats équipe (teamStats) agrégées dans MatchState.
//
// Agrégation par équipe (home / away) des points, FG made/attempted,
// turnovers, rebonds offensifs/défensifs. Invariant : teamStats.home.points
// === homeScore (et idem pour away).

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
} from '../gameLoop';

function tickUntil(
  state: ReturnType<typeof createInitialMatchState>,
  baseState: AppState,
  predicate: (s: ReturnType<typeof createInitialMatchState>) => boolean,
  options: Parameters<typeof tickMatch>[3] = {},
  maxTicks = 500
): ReturnType<typeof createInitialMatchState> {
  let cur = state;
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(cur)) return cur;
    cur = tickMatch(cur, MATCH_TICK_MS, baseState, options);
  }
  return cur;
}

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

describe('Phase 1.4 — teamStats agrégation', () => {
  it('invariant : teamStats.home.points === homeScore après une session multi-possessions', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 42, maxPossessions: 5 });
    // Joue jusqu'à fin de session (max 5000 ticks pour sécurité)
    for (let i = 0; i < 5000; i++) {
      if (
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions &&
        state.outcome !== null
      ) break;
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }
    expect(state.teamStats.home.points).toBe(state.homeScore);
    expect(state.teamStats.away.points).toBe(state.awayScore);
  });

  it('createInitialMatchState initialise teamStats à zéro', () => {
    const baseState = buildState('pnr-central');
    const state = createInitialMatchState(baseState, { seed: 1 });
    expect(state.teamStats).toBeDefined();
    expect(state.teamStats.home).toEqual({
      points: 0,
      fgMade: 0,
      fgAttempted: 0,
      turnovers: 0,
      oReb: 0,
      dReb: 0,
    });
    expect(state.teamStats.away).toEqual({
      points: 0,
      fgMade: 0,
      fgAttempted: 0,
      turnovers: 0,
      oReb: 0,
      dReb: 0,
    });
  });

  it('home joue plusieurs possessions → teamStats reflètent au moins 1 tir tenté', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 7, maxPossessions: 3 });
    for (let i = 0; i < 3000; i++) {
      if (
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions &&
        state.outcome !== null
      ) break;
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }
    // Au moins une possession home s'est terminée → au moins 1 tir tenté
    // (ou 1 turnover), donc fgAttempted + turnovers >= 1
    const homeActions = state.teamStats.home.fgAttempted + state.teamStats.home.turnovers;
    expect(homeActions).toBeGreaterThanOrEqual(1);
  });

  it('tir home manqué + rebond défensif → teamStats.away.dReb += 1', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 99, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-missed', score: 0, attackingTeam: 'home' };
    // Force rebond défensif via offensiveReboundRate: 0
    state = tickUntil(state, baseState, (s) => s.attackingTeam === 'away', { offensiveReboundRate: 0 });

    expect(state.teamStats.away.dReb).toBe(1);
    expect(state.teamStats.home.oReb).toBe(0);
  });

  it('tir home manqué + rebond offensif → teamStats.home.oReb += 1', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 99, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-missed', score: 0, attackingTeam: 'home' };
    // Force rebond offensif via offensiveReboundRate: 1
    let cur = state;
    for (let i = 0; i < 200; i++) {
      cur = tickMatch(cur, MATCH_TICK_MS, baseState, { offensiveReboundRate: 1 });
      if (cur.outcome === null && cur.attackingTeam === 'home' && cur.teamStats.home.oReb > 0) break;
    }
    expect(cur.teamStats.home.oReb).toBeGreaterThanOrEqual(1);
  });

  it('away score (stub override) → teamStats.away.points et fgMade incrémentés', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 8, maxPossessions: 3 });
    state = {
      ...state,
      outcome: null,
      score: 0,
      attackingTeam: 'away',
      intent: { kind: 'away-possession', remainingMs: MATCH_TICK_MS },
      shotClockMs: 2_000,
    };
    const next = tickMatch(state, MATCH_TICK_MS, baseState, { awayScoreOverride: true });

    expect(next.teamStats.away.points).toBe(2);
    expect(next.teamStats.away.fgMade).toBe(1);
    expect(next.teamStats.away.fgAttempted).toBe(1);
    // Invariant
    expect(next.teamStats.away.points).toBe(next.awayScore);
  });
});
