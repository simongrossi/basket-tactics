// Tests L.0.3 — résolution de la couverture défensive jouée.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { resolveScreenCoverage } from '../resolveCoverage';

/** PnR : O5 pose un écran sur D1 (forcedScreener), O1 dribble. Step 1 = usage. */
function makeScreenState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const offN1: AttackerPositions = {
    O1: { x: 300, y: 380 },
    O2: { x: 100, y: 380 },
    O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 },
    O5: { x: 305, y: 350 },
  };
  const offN: AttackerPositions = {
    ...offN1,
    O1: { x: 280, y: 350 },
    O5: { x: 305, y: 320 },
  };
  return {
    ...s0,
    steps: [
      makeStep(offN1, 'O1', []),
      { ...makeStep(offN, 'O1', []), forcedScreener: 'O5' },
    ],
    activeStep: 1,
    ...overrides,
  };
}

describe('resolveScreenCoverage', () => {
  it('renvoie la règle globale quand aucun override défenseur', () => {
    const state = makeScreenState({ screenRule: 'drop' });
    expect(resolveScreenCoverage(state, 1)).toBe('drop');
  });

  it("l'override individuel du défenseur du porteur prime sur la globale", () => {
    const s = makeScreenState({ screenRule: 'drop' });
    // D1 défend O1 (le porteur). Son screenNav override la règle globale.
    const state: AppState = {
      ...s,
      rules: { ...s.rules, D1: { ...s.rules.D1, screenNav: 'blitz' } },
    };
    expect(resolveScreenCoverage(state, 1)).toBe('blitz');
  });

  it("screenNav='auto' retombe sur la règle globale", () => {
    const s = makeScreenState({ screenRule: 'blitz' });
    const state: AppState = {
      ...s,
      rules: { ...s.rules, D1: { ...s.rules.D1, screenNav: 'auto' } },
    };
    expect(resolveScreenCoverage(state, 1)).toBe('blitz');
  });

  it('renvoie null si aucun écran détecté (pas de forcedScreener, joueurs écartés)', () => {
    const s0 = makeInitialState();
    // Étalement large : aucun attaquant proche du défenseur du porteur.
    const off: AttackerPositions = {
      O1: { x: 300, y: 500 },
      O2: { x: 60, y: 500 },
      O3: { x: 540, y: 500 },
      O4: { x: 60, y: 200 },
      O5: { x: 540, y: 200 },
    };
    const state: AppState = {
      ...s0,
      steps: [makeStep(off, 'O1', []), makeStep(off, 'O1', [])],
      activeStep: 1,
      screenRule: 'drop',
    };
    expect(resolveScreenCoverage(state, 1)).toBeNull();
  });

  it('renvoie null en défense non-man (zone)', () => {
    const state = makeScreenState({ screenRule: 'drop', defenseSystem: 'zone' });
    expect(resolveScreenCoverage(state, 1)).toBeNull();
  });

  it('renvoie null pour un index hors bornes', () => {
    const state = makeScreenState({ screenRule: 'drop' });
    expect(resolveScreenCoverage(state, -1)).toBeNull();
    expect(resolveScreenCoverage(state, 99)).toBeNull();
  });
});
