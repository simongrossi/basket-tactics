// Phase 1.2 — Montée de balle (advance the ball)
//
// Quand le porteur récupère le ballon en backcourt (y > HALF_COURT_Y),
// il doit monter le ballon vers la frontcourt (y < 540) avant que l'IA
// reprenne ses décisions normales (drive/pass/shoot).
//
// Règle FIBA : 8s pour franchir la ligne médiane sinon violation.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
} from '../gameLoop';
import { HALF_COURT_Y } from '../../awayPossessionSetup';

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

describe('Phase 1.2 — Montée de balle (advance the ball)', () => {
  it('porteur home en backcourt → tick → intent devient advance', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 10, maxPossessions: 3 });
    // Construire un état où home a le ballon en backcourt (= y > 540)
    // Simule la situation post-passe rentrante : porteur à y = 900
    state = {
      ...state,
      attackingTeam: 'home',
      intent: { kind: 'idle' },
      inboundTimerMs: null, // passe rentrante déjà effectuée
      off: {
        ...state.off,
        [state.carrier]: { x: 300, y: 900 }, // backcourt deep
      },
    };

    state = tickMatch(state, MATCH_TICK_MS, baseState);

    expect(state.intent.kind).toBe('advance');
  });

  it('porteur en advance → y décroît à chaque tick (montée vers la médiane)', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 10, maxPossessions: 3 });
    state = {
      ...state,
      attackingTeam: 'home',
      intent: { kind: 'idle' },
      inboundTimerMs: null,
      off: { ...state.off, [state.carrier]: { x: 300, y: 900 } },
    };

    state = tickMatch(state, MATCH_TICK_MS, baseState);
    const yAfter1 = state.off[state.carrier]!.y;
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    const yAfter2 = state.off[state.carrier]!.y;

    expect(yAfter1).toBeLessThan(900); // a avancé
    expect(yAfter2).toBeLessThan(yAfter1); // continue de descendre
  });

  it('porteur en advance franchit la médiane → intent revient à idle', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 10, maxPossessions: 3 });
    state = {
      ...state,
      attackingTeam: 'home',
      intent: { kind: 'idle' },
      inboundTimerMs: null,
      off: { ...state.off, [state.carrier]: { x: 300, y: 600 } }, // proche médiane
    };

    // Ticker jusqu'à ce que le porteur franchisse y < 540
    for (let i = 0; i < 200; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.intent.kind !== 'advance') break;
    }

    // Après franchissement, intent != advance (idle ou décision IA)
    expect(state.intent.kind).not.toBe('advance');
    expect(state.off[state.carrier]!.y).toBeLessThan(HALF_COURT_Y);
  });

  it('porteur en advance ne franchit pas → 8s → violation turnover', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 10, maxPossessions: 3 });
    // Position TRÈS deep + advanceTimerMs déjà court pour forcer l'expiration
    state = {
      ...state,
      attackingTeam: 'home',
      intent: { kind: 'advance', targetY: HALF_COURT_Y - 20, advanceTimerMs: MATCH_TICK_MS },
      inboundTimerMs: null,
      off: { ...state.off, [state.carrier]: { x: 300, y: 1000 } },
    };

    state = tickMatch(state, MATCH_TICK_MS, baseState);

    expect(state.outcome).toBe('turnover-pass');
  });
});
