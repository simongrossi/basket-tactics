// Tests closeoutQuality — qualité du closeout sur un shooter (skip pass).
//
// Vérifie que speedConstraint calcule correctement closeoutQuality en fonction
// de la distance que D3 doit parcourir vers O3 (shooter en corner) après un
// changement de porteur (skip pass O1 → O3).

import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un state avec 2 steps : step 0 = O1 porteur, step 1 = O3 porteur
 *  (skip pass reçu). D3 se trouve à prevDefPos à l'étape 0.
 *  O3 est positionné en corner droit (547, 80).
 *
 *  defenseOverrides sur step 0 fixe D3 à prevDefPos → garantit que
 *  prevPositions.D3 au step 1 = prevDefPos (indépendamment du sag naturel). */
function makeSkipPassState(prevDefPos: { x: number; y: number }): AppState {
  const base = makeInitialState();
  const corner = { x: 547, y: 80 };
  const step0Off = {
    O1: { x: 300, y: 470 },
    O2: { x: 100, y: 380 },
    O3: corner,
    O4: { x: 200, y: 230 },
    O5: { x: 400, y: 230 },
  };
  return {
    ...base,
    // footworkRulesEnabled=true → prevPositions = positions effectives réelles
    // (pas les cibles). Nécessaire pour que l'override step 0 soit reflété dans
    // prevPositions au step 1.
    footworkRulesEnabled: true,
    attackerProfiles: {
      O1: 'creator',
      O2: 'slasher',
      O3: 'shooter',
      O4: 'rim-roller',
      O5: 'stretch-big',
    },
    defenseInitial: {
      D1: { x: 310, y: 440 },
      D2: { x: 120, y: 360 },
      D3: prevDefPos,
      D4: { x: 210, y: 220 },
      D5: { x: 390, y: 220 },
    },
    steps: [
      {
        ...base.steps[0],
        off: step0Off,
        ballCarrier: 'O1',
        // Ancre D3 à prevDefPos au step 0 → prevPositions.D3 = prevDefPos au step 1.
        defenseOverrides: { D3: prevDefPos },
        annotations: [],
      },
      {
        ...base.steps[0],
        off: step0Off,
        ballCarrier: 'O3',
        annotations: [],
      },
    ],
  };
}

describe('closeoutQuality — qualité du closeout sur shooter', () => {
  it('clean : D3 à ~58px du corner — closeoutQuality = clean', () => {
    // D3 à (540, 138) → dist vers (547, 80) ≈ sqrt(49 + 3364) ≈ 58.5px
    const state = makeSkipPassState({ x: 540, y: 138 });
    const result = effectiveDefensePositions(state, 1);
    expect(result.D3.closingOut).toBe(true);
    expect(result.D3.closeoutQuality).toBe('clean');
  });

  it('desperate : D3 à ~120px — closeoutQuality = desperate', () => {
    // D3 à (500, 195) → dist vers (547, 80) ≈ sqrt(2209 + 13225) ≈ 124px
    const state = makeSkipPassState({ x: 500, y: 195 });
    const result = effectiveDefensePositions(state, 1);
    expect(result.D3.closingOut).toBe(true);
    expect(result.D3.closeoutQuality).toBe('desperate');
  });

  it('late : D3 à ~200px — closeoutQuality = late', () => {
    // D3 à (400, 240) → dist vers (547, 80) ≈ sqrt(21609 + 25600) ≈ 217px
    const state = makeSkipPassState({ x: 400, y: 240 });
    const result = effectiveDefensePositions(state, 1);
    expect(result.D3.closingOut).toBe(true);
    expect(result.D3.closeoutQuality).toBe('late');
  });

  it('step 0 porteur inchangé — D1 pas en closeout, closeoutQuality undefined', () => {
    const state = makeSkipPassState({ x: 540, y: 138 });
    const result = effectiveDefensePositions(state, 0);
    expect(result.D1.closingOut).toBeUndefined();
    expect(result.D1.closeoutQuality).toBeUndefined();
  });
});
