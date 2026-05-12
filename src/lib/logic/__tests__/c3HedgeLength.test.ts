// Tests C.3 — hedge length (compteur consecutive hedge + force recovery).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { consecutiveHedgeSteps } from '@/lib/logic/screens';

/** Construit un AppState avec N steps consécutifs où O5 pose un écran sur D1.
 *  Chaque step a forcedScreener=O5 + O5 collé sur D1. */
function makeHedgeScenarioState(numSteps: number, overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 305, y: 380 }, // collé sur D1
  };
  return {
    ...s0,
    steps: Array.from({ length: numSteps }, () => ({
      ...makeStep(off, 'O1', []),
      forcedScreener: 'O5' as const,
    })),
    activeStep: numSteps - 1,
    screenRule: 'hedge',
    ...overrides,
  };
}

describe('consecutiveHedgeSteps', () => {
  it("0 si pas d'écran détecté au step", () => {
    const s0 = makeInitialState();
    const state: AppState = {
      ...s0,
      steps: [{ ...s0.steps[0], off: { ...s0.steps[0].off, O5: { x: 50, y: 50 } } }],
    };
    expect(consecutiveHedgeSteps(state, 0, 'O5')).toBe(0);
  });

  it("1 si l'écran est détecté seulement au step courant", () => {
    const state = makeHedgeScenarioState(1);
    expect(consecutiveHedgeSteps(state, 0, 'O5')).toBe(1);
  });

  it("compte les steps consécutifs avec le MÊME poseur", () => {
    const state = makeHedgeScenarioState(3);
    expect(consecutiveHedgeSteps(state, 2, 'O5')).toBe(3);
  });

  it("0 si poseur différent (continuité cassée)", () => {
    const state = makeHedgeScenarioState(3);
    expect(consecutiveHedgeSteps(state, 2, 'O3')).toBe(0);
  });

  it("respecte maxLookback", () => {
    const state = makeHedgeScenarioState(10);
    expect(consecutiveHedgeSteps(state, 9, 'O5', 3)).toBeLessThanOrEqual(3);
  });
});

describe('hedgeRecoveryDelay — intégration', () => {
  it("undefined → comportement legacy (D5 reste sorti tant que l'écran est détecté)", () => {
    const state = makeHedgeScenarioState(3); // pas de hedgeRecoveryDelay
    const def0 = effectiveDefensePositions(state, 0);
    const def2 = effectiveDefensePositions(state, 2);
    // D5 reste sorti aux 3 steps. Position similaire.
    const dx = def2.D5.x - def0.D5.x;
    const dy = def2.D5.y - def0.D5.y;
    expect(Math.hypot(dx, dy)).toBeLessThan(20);
  });

  it("delay=1 → après 1 step de hedge, D5 force recovery au step 2", () => {
    const state = makeHedgeScenarioState(3, { hedgeRecoveryDelay: 1 });
    const def0 = effectiveDefensePositions(state, 0); // hedge actif
    const def2 = effectiveDefensePositions(state, 2); // recovery forcé
    // Au step 2, count=3 > delay=1 → rule basculée à 'over'.
    // D5 doit être proche d'O5 (homme-à-homme natural) au lieu d'être sorti devant O1.
    const o5 = state.steps[2].off.O5;
    const distD5toO5 = Math.hypot(def2.D5.x - o5.x, def2.D5.y - o5.y);
    // D5 défend O5 → proche (< 50px = defenseDistance).
    expect(distD5toO5).toBeLessThan(50);
  });

  it("delay=3 → pas de recovery (count=3 ≤ delay, comportement legacy préservé)", () => {
    const stateLegacy = makeHedgeScenarioState(3); // pas de delay = legacy
    const stateDelay3 = makeHedgeScenarioState(3, { hedgeRecoveryDelay: 3 });
    const defLegacy = effectiveDefensePositions(stateLegacy, 2);
    const defDelay3 = effectiveDefensePositions(stateDelay3, 2);
    // count=3, delay=3 → condition `count > delay` est false → comportement
    // identique au legacy. Positions D5 essentiellement identiques (< 5px).
    const dx = defDelay3.D5.x - defLegacy.D5.x;
    const dy = defDelay3.D5.y - defLegacy.D5.y;
    expect(Math.hypot(dx, dy)).toBeLessThan(5);
  });
});
