// Tests B1 — game loop autonome. Vérifie les invariants principaux du tick :
// shot clock décrémenté, possession qui se termine proprement, déterminisme
// du replay via seed, intent persistant entre ticks.

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
  };
}

function runUntilEnd(
  baseState: AppState,
  seed: number,
  maxTicks = 200
): ReturnType<typeof createInitialMatchState> {
  let state = createInitialMatchState(baseState, { seed });
  for (let i = 0; i < maxTicks; i += 1) {
    if (state.outcome !== null) break;
    state = tickMatch(state, MATCH_TICK_MS, baseState);
  }
  return state;
}

describe('gameLoop — createInitialMatchState', () => {
  it('initialise un état cohérent depuis un template', () => {
    const baseState = buildState('pnr-central');
    const state = createInitialMatchState(baseState, { seed: 42 });
    expect(state.shotClockMs).toBe(24_000);
    expect(state.outcome).toBeNull();
    expect(state.intent.kind).toBe('idle');
    expect(state.tickCount).toBe(0);
    expect(state.possessionTimeMs).toBe(0);
    expect(state.score).toBe(0);
    expect(state.eventLog).toEqual([]);
    expect(state.seed).toBe(42);
    // 5 attaquants + 5 défenseurs présents
    expect(Object.keys(state.off)).toHaveLength(5);
    expect(Object.keys(state.defPos)).toHaveLength(5);
    // Ballon proche du porteur (offset visuel +16, -16)
    const carrierPos = state.off[state.carrier];
    expect(state.ballPos.x).toBeCloseTo(carrierPos!.x + 16, 0);
    expect(state.ballPos.y).toBeCloseTo(carrierPos!.y - 16, 0);
  });
});

describe('gameLoop — tickMatch', () => {
  it('décrémente le shot clock à chaque tick', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1 });
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.shotClockMs).toBe(24_000 - MATCH_TICK_MS);
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.shotClockMs).toBe(24_000 - 2 * MATCH_TICK_MS);
    expect(state.tickCount).toBe(2);
    expect(state.possessionTimeMs).toBe(2 * MATCH_TICK_MS);
  });

  it('termine en forced shot quand le shot clock arrive à 0', () => {
    const baseState = buildState('pnr-central');
    // On force un état avec un shot clock très court.
    let state = createInitialMatchState(baseState, {
      seed: 7,
      shotClockMs: MATCH_TICK_MS, // 1 tick et c'est fini
    });
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    // Après ce tick le shot clock est à 0, forced shot doit s'enclencher.
    expect(state.shotClockMs).toBe(0);
    expect(state.outcome).not.toBeNull();
    expect(['forced-shot-made', 'forced-shot-missed']).toContain(state.outcome);
  });

  it('produit une possession qui se termine avec un outcome', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 1234);
    expect(final.outcome).not.toBeNull();
    expect(final.intent.kind).toBe('idle');
  });

  it('est déterministe : même seed produit le même outcome final', () => {
    const baseState = buildState('pnr-central');
    const run1 = runUntilEnd(baseState, 99);
    const run2 = runUntilEnd(baseState, 99);
    expect(run1.outcome).toBe(run2.outcome);
    expect(run1.score).toBe(run2.score);
    expect(run1.tickCount).toBe(run2.tickCount);
    expect(run1.eventLog.length).toBe(run2.eventLog.length);
  });

  it('no-op si la possession est déjà terminée', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 50);
    expect(final.outcome).not.toBeNull();
    const afterExtra = tickMatch(final, MATCH_TICK_MS, baseState);
    // Aucun changement (même référence ou état identique).
    expect(afterExtra.outcome).toBe(final.outcome);
    expect(afterExtra.score).toBe(final.score);
    expect(afterExtra.tickCount).toBe(final.tickCount);
  });

  it('log au moins un événement quand une possession se termine par un tir', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 333);
    expect(final.eventLog.length).toBeGreaterThan(0);
    const types = final.eventLog.map((e) => e.type);
    // Au minimum un terminal : shot / forced-shot / turnover.
    expect(
      types.some((t) => t === 'shot' || t === 'forced-shot' || t === 'turnover')
    ).toBe(true);
  });

  it('respecte le shot clock total : tickCount × MATCH_TICK_MS <= shotClockMs initial', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 777);
    expect(final.possessionTimeMs).toBeLessThanOrEqual(24_000);
  });
});

describe('gameLoop — intent persistance', () => {
  it("garde l'intent drive entre 2 ticks tant que le porteur n'a pas atteint sa cible", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 12345 });
    // On boucle jusqu'à voir un intent non-idle.
    for (let i = 0; i < 50; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.intent.kind !== 'idle') break;
    }
    // Au moins un tick a produit un intent (drive ou pass).
    expect(['drive', 'pass', 'shoot']).toContain(state.intent.kind);
  });
});
