// Tests B6 — dig / double au post.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** AppState où O1 (porteur) est posté en low post côté droit. Le trigger
 *  post est ACTIVÉ par défaut dans makeInitialState. */
function makePostUpState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  // Low post côté droit : lateralOff ∈ [80, 160], yIntoCourt ∈ [45, 145].
  // HOOP top à (300, 75). On veut carrier.x ∈ [380, 460], carrier.y ∈ [120, 220].
  const postPos = { x: 400, y: 150 };
  const off: AttackerPositions = {
    O1: postPos, // porteur posté
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 380, y: 230 }, // proche du pivot → candidat digger naturel
  };
  return {
    ...s0,
    steps: [makeStep(off, 'O1', []), makeStep(off, 'O1', [])], // 2 steps statiques → post tenu
    activeStep: 1,
    triggers: { ...s0.triggers, post: true },
    ...overrides,
  };
}

describe('B6 — postCoverage', () => {
  it("'none' (default) → aucune modification de position", () => {
    const stateA = makePostUpState();
    const stateB = makePostUpState({ postCoverage: 'none' });
    const defA = effectiveDefensePositions(stateA, 1);
    const defB = effectiveDefensePositions(stateB, 1);
    // Les deux configs default 'none' → positions identiques.
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((d) => {
      const dx = defA[d].x - defB[d].x;
      const dy = defA[d].y - defB[d].y;
      expect(Math.hypot(dx, dy)).toBeLessThan(2);
    });
  });

  it("'dig' → un défenseur non-carrierDef est rapproché du pivot", () => {
    const stateOff = makePostUpState({ postCoverage: 'none' });
    const stateDig = makePostUpState({ postCoverage: 'dig' });
    const defOff = effectiveDefensePositions(stateOff, 1);
    const defDig = effectiveDefensePositions(stateDig, 1);

    // Au moins un défenseur ≠ D1 a bougé significativement vers le pivot.
    let diggerFound = 0;
    (['D2', 'D3', 'D4', 'D5'] as const).forEach((d) => {
      const before = Math.hypot(defOff[d].x - 400, defOff[d].y - 150);
      const after = Math.hypot(defDig[d].x - 400, defDig[d].y - 150);
      if (after < before - 5) diggerFound++;
    });
    expect(diggerFound).toBeGreaterThanOrEqual(1);
  });

  it("'double' déplace plus que 'dig'", () => {
    const stateDig = makePostUpState({ postCoverage: 'dig' });
    const stateDouble = makePostUpState({ postCoverage: 'double' });
    const defDig = effectiveDefensePositions(stateDig, 1);
    const defDouble = effectiveDefensePositions(stateDouble, 1);

    // Le digger en mode 'double' doit être strictement plus près du pivot
    // que celui en mode 'dig'. On compare le défenseur le plus proche
    // dans chaque cas.
    const pivot = { x: 400, y: 150 };
    let minDig = Infinity;
    let minDouble = Infinity;
    (['D2', 'D3', 'D4', 'D5'] as const).forEach((d) => {
      const dDig = Math.hypot(defDig[d].x - pivot.x, defDig[d].y - pivot.y);
      const dDouble = Math.hypot(defDouble[d].x - pivot.x, defDouble[d].y - pivot.y);
      if (dDig < minDig) minDig = dDig;
      if (dDouble < minDouble) minDouble = dDouble;
    });
    expect(minDouble).toBeLessThan(minDig);
  });

  it("requiert state.triggers.post : 'dig' sans trigger = no-op", () => {
    const stateOff = makePostUpState({
      postCoverage: 'dig',
      triggers: { drive: true, post: false, paint: true, trap: false },
    });
    const stateOn = makePostUpState({
      postCoverage: 'none',
      triggers: { drive: true, post: false, paint: true, trap: false },
    });
    const defA = effectiveDefensePositions(stateOff, 1);
    const defB = effectiveDefensePositions(stateOn, 1);
    // Sans trigger post → 'dig' n'a aucun effet (= 'none').
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((d) => {
      const dx = defA[d].x - defB[d].x;
      const dy = defA[d].y - defB[d].y;
      expect(Math.hypot(dx, dy)).toBeLessThan(2);
    });
  });
});
