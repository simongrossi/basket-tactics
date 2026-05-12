// Tests B8 — switch policy granulaire.

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { switchAllowed } from '../defense/mismatchTracking';

describe('switchAllowed', () => {
  it("'all' autorise tout", () => {
    expect(switchAllowed('all', 'D1', 'D5')).toBe(true);
    expect(switchAllowed('all', 'D2', 'D3')).toBe(true);
  });

  it("'none' refuse tout", () => {
    expect(switchAllowed('none', 'D1', 'D2')).toBe(false);
    expect(switchAllowed('none', 'D3', 'D4')).toBe(false);
  });

  it("'1-3' autorise seulement entre D1/D2/D3", () => {
    expect(switchAllowed('1-3', 'D1', 'D2')).toBe(true);
    expect(switchAllowed('1-3', 'D2', 'D3')).toBe(true);
    expect(switchAllowed('1-3', 'D1', 'D3')).toBe(true);
    // Avec D4 ou D5 → refuse
    expect(switchAllowed('1-3', 'D1', 'D4')).toBe(false);
    expect(switchAllowed('1-3', 'D3', 'D5')).toBe(false);
    expect(switchAllowed('1-3', 'D4', 'D5')).toBe(false);
  });

  it("'1-4' autorise tout sauf le pivot (D5)", () => {
    expect(switchAllowed('1-4', 'D1', 'D4')).toBe(true);
    expect(switchAllowed('1-4', 'D3', 'D4')).toBe(true);
    expect(switchAllowed('1-4', 'D1', 'D5')).toBe(false);
    expect(switchAllowed('1-4', 'D4', 'D5')).toBe(false);
  });
});

/** Reproduit le scénario "écran O5 → O1, screenRule = switch" et observe
 *  les matchups résultants sous différentes policies. */
function makeSwitchScenario(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      {
        ...s0.steps[0],
        off: {
          ...s0.steps[0].off,
          O5: { x: 305, y: 380 }, // O5 plaqué sur D1
        },
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
    ],
    screenRule: 'switch',
    ...overrides,
  };
}

describe('switchPolicy — intégration (effectiveDefensePositions)', () => {
  it("default 'all' → switch s'applique normalement", () => {
    const state = makeSwitchScenario(); // pas de switchPolicy → default 'all'
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.matchedTo).toBe('O5');
    expect(def.D5.matchedTo).toBe('O1');
  });

  it("'none' → bloque le switch même si rule = switch", () => {
    const state = makeSwitchScenario({ switchPolicy: 'none' });
    const def = effectiveDefensePositions(state, 0);
    // Matchups inchangés (D1 reste sur O1, D5 reste sur O5)
    expect(def.D1.matchedTo).toBe('O1');
    expect(def.D5.matchedTo).toBe('O5');
  });

  it("'1-3' → bloque switch D1↔D5 (D5 > 3)", () => {
    const state = makeSwitchScenario({ switchPolicy: '1-3' });
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.matchedTo).toBe('O1'); // pas de switch
    expect(def.D5.matchedTo).toBe('O5');
  });

  it("'1-4' → bloque switch impliquant D5 (le pivot)", () => {
    const state = makeSwitchScenario({ switchPolicy: '1-4' });
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.matchedTo).toBe('O1');
    expect(def.D5.matchedTo).toBe('O5');
  });

  it("'1-4' AUTORISE switch entre D1 et D4 (deux non-pivots)", () => {
    // Scenario : O4 plaqué sur D1 (au lieu d'O5). Switch attendu si policy ≠ 'none'.
    const s0 = makeInitialState();
    const state: AppState = {
      ...s0,
      steps: [
        {
          ...s0.steps[0],
          off: { ...s0.steps[0].off, O4: { x: 305, y: 380 } },
          ballCarrier: 'O1',
          forcedScreener: 'O4',
        },
      ],
      screenRule: 'switch',
      switchPolicy: '1-4',
    };
    const def = effectiveDefensePositions(state, 0);
    // D1↔D4 autorisé en '1-4'
    expect(def.D1.matchedTo).toBe('O4');
    expect(def.D4.matchedTo).toBe('O1');
  });

  it("'1-3' AUTORISE switch entre D1 et D2 (deux guards)", () => {
    const s0 = makeInitialState();
    const state: AppState = {
      ...s0,
      steps: [
        {
          ...s0.steps[0],
          off: { ...s0.steps[0].off, O2: { x: 305, y: 380 } },
          ballCarrier: 'O1',
          forcedScreener: 'O2',
        },
      ],
      screenRule: 'switch',
      switchPolicy: '1-3',
    };
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.matchedTo).toBe('O2');
    expect(def.D2.matchedTo).toBe('O1');
  });
});
