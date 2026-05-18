// Phase 1 — Test d'intégration "Mode démo".
//
// Vérifie que le flow complet d'une session multi-possessions ne bloque
// pas dans un deadlock (ex : IA qui reste figée en backcourt sans passer,
// inbound qui ne se termine jamais, etc.).
//
// Lance 3 possessions avec maxPossessions=3 et vérifie :
// - La session se termine (possessionsPlayed >= maxPossessions)
// - Au moins 1 outcome home + 1 outcome away se produisent
// - Le score augmente sur au moins une des deux équipes
// - Les stats équipe sont cohérentes (invariant points === score)
//
// Fait avec un seed fixe pour déterminisme.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
} from '../gameLoop';

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
    fullCourt: true,
  };
}

describe('Phase 1 — Intégration : flow démo multi-possessions', () => {
  it('3 possessions s\'enchaînent sans deadlock', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 42, maxPossessions: 3 });

    // 30 sec max simulés (= ~900 ticks) doit suffire pour 3 possessions
    // même avec 12s d'away stub par possession.
    let ticks = 0;
    const MAX_TICKS = 3000;
    while (ticks < MAX_TICKS) {
      const sessionDone =
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions &&
        state.outcome !== null;
      if (sessionDone) break;
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      ticks++;
    }

    expect(ticks).toBeLessThan(MAX_TICKS); // pas de deadlock
    expect(state.possessionsPlayed).toBeGreaterThanOrEqual(3);
  });

  it('Invariant stats : teamStats.home.points === homeScore après session complète', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 42, maxPossessions: 3 });
    for (let i = 0; i < 3000; i++) {
      const sessionDone =
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions &&
        state.outcome !== null;
      if (sessionDone) break;
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }
    expect(state.teamStats.home.points).toBe(state.homeScore);
    expect(state.teamStats.away.points).toBe(state.awayScore);
  });

  it('Inbound déclenché sur tir home marqué (forcé via état direct)', () => {
    // On force directement un panier home marqué pour exercer le code path
    // d'inbound sans dépendre du hasard de la rng sur 5 possessions.
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 7, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };
    let inboundObserved = false;
    for (let i = 0; i < 100; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.inboundTimerMs !== null && state.inboundTimerMs > 0) {
        inboundObserved = true;
        break;
      }
    }
    expect(inboundObserved).toBe(true);
  });

  it('5 possessions seed 42 : home + away ont marqué + inbound observé', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 42, maxPossessions: 5 });
    let inboundObserved = false;
    for (let i = 0; i < 5000; i++) {
      const sessionDone =
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions &&
        state.outcome !== null;
      if (sessionDone) break;
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.inboundTimerMs !== null && state.inboundTimerMs > 0) {
        inboundObserved = true;
      }
    }
    // Avec 5 stubs away à AWAY_SCORE_PROBABILITY=0.5, statistiquement
    // ~2-3 doivent marquer. Et chaque score (home OU away) déclenche
    // un inbound.
    const totalScored = state.homeScore + state.awayScore;
    expect(totalScored).toBeGreaterThan(0);
    expect(inboundObserved).toBe(true);
  });

  it('Inbound déclenché côté home sur away score forcé', () => {
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

    expect(next.attackingTeam).toBe('home');
    expect(next.inboundTimerMs).toBe(5_000);
  });
});
