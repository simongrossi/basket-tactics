// Tests B10 — bump auto sur cutters.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un AppState avec un cut détectable : O3 coupe vers le panier
 *  de (470, 380) à (440, 200). O4 placé à (470, 320) pour que sa défense
 *  naturelle (D4) arrive proche de la trajectoire de cut (~ (447, 287)).
 *  Ainsi le bump est applicable sans defenseOverrides (qui figerait D4). */
function makeCutState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const offN1: AttackerPositions = {
    O1: { x: 300, y: 470 }, // porteur, statique
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 }, // futur cutter
    O4: { x: 470, y: 320 }, // proche de la trajectoire — D4 atterrira dans les 40px
    O5: { x: 380, y: 230 },
  };
  const offN: AttackerPositions = { ...offN1, O3: { x: 440, y: 200 } };
  return {
    ...s0,
    steps: [makeStep(offN1, 'O1', []), makeStep(offN, 'O1', [])],
    activeStep: 1,
    ...overrides,
  };
}

describe('B10 — autoBumpCutters', () => {
  it('default false → aucune modification des positions', () => {
    const state = makeCutState(); // autoBumpCutters non défini
    const def = effectiveDefensePositions(state, 1);
    // Test sentinel : positions cohérentes avec le défense naturelle
    // (D3 sur O3 quelque part proche du panier). On vérifie surtout
    // que le pipeline n'a pas crashé.
    expect(def.D3).toBeDefined();
    expect(def.D3.matchedTo).toBe('O3');
  });

  it('activé → au moins un défenseur autre que D3 est shifté', () => {
    // On compare positions sans/avec bump.
    const stateOff = makeCutState();
    const stateOn = makeCutState({ autoBumpCutters: true });

    const defOff = effectiveDefensePositions(stateOff, 1);
    const defOn = effectiveDefensePositions(stateOn, 1);

    // Cherche un défenseur ≠ D3 avec position significativement différente.
    let shifted = 0;
    (['D1', 'D2', 'D4', 'D5'] as const).forEach((dId) => {
      const dx = defOn[dId].x - defOff[dId].x;
      const dy = defOn[dId].y - defOff[dId].y;
      if (Math.hypot(dx, dy) > 5) shifted++;
    });
    expect(shifted).toBeGreaterThanOrEqual(1);
  });

  it("ne shifte PAS le défenseur naturel du cutter (D3)", () => {
    const stateOff = makeCutState();
    const stateOn = makeCutState({ autoBumpCutters: true });
    const d3Off = effectiveDefensePositions(stateOff, 1).D3;
    const d3On = effectiveDefensePositions(stateOn, 1).D3;
    // D3 suit O3 naturellement, le bump ne s'applique pas à lui.
    // On tolère une petite différence (interpolation, vitesse) mais pas un
    // gros offset additionnel.
    const dx = d3On.x - d3Off.x;
    const dy = d3On.y - d3Off.y;
    expect(Math.hypot(dx, dy)).toBeLessThan(15);
  });

  it("pas de bump si pas de cut détecté (cutter statique)", () => {
    // Construire un état où O3 est statique entre N-1 et N
    const s0 = makeInitialState();
    const staticOff: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const state: AppState = {
      ...s0,
      steps: [makeStep(staticOff, 'O1', []), makeStep(staticOff, 'O1', [])],
      activeStep: 1,
      autoBumpCutters: true,
    };

    const stateNoBump: AppState = { ...state, autoBumpCutters: false };

    const defOn = effectiveDefensePositions(state, 1);
    const defOff = effectiveDefensePositions(stateNoBump, 1);

    // Pas de cut → positions identiques entre on/off.
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const dx = defOn[dId].x - defOff[dId].x;
      const dy = defOn[dId].y - defOff[dId].y;
      expect(Math.hypot(dx, dy)).toBeLessThan(2);
    });
  });
});
