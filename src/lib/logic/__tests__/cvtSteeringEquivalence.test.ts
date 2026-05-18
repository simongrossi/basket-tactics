// CVT Chantier 1.1 — Tests d'équivalence intégrés.
//
// Vérifie que le flag `state.useSteeringEngine = true` produit des
// positions défensives strictement identiques au pipeline legacy
// (bit-équivalence du target absolu, à `EQ_TOL` près pour absorber
// les arrondis du normalize-puis-multiplie).
//
// Ces tests sont la garantie de non-régression de la sous-étape 1.1.
// Quand on retunera vraiment (1.1b : ajout d'`arrive`, etc.), ces
// tests basculeront en "tolérance contrôlée" (qq px max) au lieu
// d'équivalence stricte.

import { describe, expect, it } from 'vitest';
import type {
  AppState,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
} from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

const EQ_TOL = 1e-6; // tolérance d'équivalence (très large vs 1e-9 unitaire ;
                     // absorbe arrondis cumulés du pipeline complet)

const DEFAULT_OFF: AttackerPositions = {
  O1: { x: 300, y: 480 },
  O2: { x: 100, y: 380 },
  O3: { x: 500, y: 380 },
  O4: { x: 200, y: 200 },
  O5: { x: 400, y: 200 },
};
const DEFAULT_DEF: DefenderPositions = {
  D1: { x: 300, y: 540 },
  D2: { x: 130, y: 410 },
  D3: { x: 470, y: 410 },
  D4: { x: 240, y: 230 },
  D5: { x: 360, y: 230 },
};
function makeScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off1: AttackerPositions = { ...DEFAULT_OFF, O1: { x: 300, y: 350 } };
  const off2: AttackerPositions = { ...DEFAULT_OFF, O1: { x: 300, y: 200 } };
  return {
    ...base,
    steps: [
      { off: DEFAULT_OFF, ballCarrier: 'O1', annotations: [] },
      { off: off1, ballCarrier: 'O1', annotations: [] },
      { off: off2, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    defenseInitial: DEFAULT_DEF,
    ...overrides,
  };
}

function expectPositionsEqual(a: DefenderPositions, b: DefenderPositions): void {
  const idsA = Object.keys(a).sort() as DefenderId[];
  const idsB = Object.keys(b).sort() as DefenderId[];
  expect(idsA).toEqual(idsB);
  for (const id of idsA) {
    const pa = a[id];
    const pb = b[id];
    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(Math.abs(pa!.x - pb!.x)).toBeLessThanOrEqual(EQ_TOL);
    expect(Math.abs(pa!.y - pb!.y)).toBeLessThanOrEqual(EQ_TOL);
  }
}

describe('CVT 1.1 — équivalence pipeline complet (flag off vs on)', () => {
  it('scénario chase basique : positions identiques à tous les steps', () => {
    const legacy = makeScenario();
    const steering = makeScenario({ useSteeringEngine: true });
    for (let i = 0; i < legacy.steps.length; i++) {
      const dL = effectiveDefensePositions(legacy, i);
      const dS = effectiveDefensePositions(steering, i);
      expectPositionsEqual(dL, dS);
    }
  });

  it('avec stances off-ball variées (deny-3q, fronting, behind, stunt)', () => {
    const baseRules = makeInitialState().rules;
    const stanceOverride: Partial<AppState> = {
      rules: {
        ...baseRules,
        D1: { ...baseRules.D1, vsCarrier: 'contester' },
        D2: { ...baseRules.D2, offBallStance: 'deny-3q' },
        D3: { ...baseRules.D3, offBallStance: 'fronting' },
        D4: { ...baseRules.D4, offBallStance: 'behind' },
        D5: { ...baseRules.D5, offBallStance: 'stunt' },
      },
    };
    const legacy = makeScenario(stanceOverride);
    const steering = makeScenario({ ...stanceOverride, useSteeringEngine: true });
    for (let i = 0; i < legacy.steps.length; i++) {
      expectPositionsEqual(
        effectiveDefensePositions(legacy, i),
        effectiveDefensePositions(steering, i),
      );
    }
  });

  it('avec vsCarrier varié (topside, baseline, reculer, bumper)', () => {
    const baseRules = makeInitialState().rules;
    const carriers: Array<'topside' | 'baseline' | 'reculer' | 'bumper' | 'coller'> = [
      'topside', 'baseline', 'reculer', 'bumper', 'coller',
    ];
    for (const vsCarrier of carriers) {
      const ovr: Partial<AppState> = {
        rules: { ...baseRules, D1: { ...baseRules.D1, vsCarrier } },
      };
      const legacy = makeScenario(ovr);
      const steering = makeScenario({ ...ovr, useSteeringEngine: true });
      for (let i = 0; i < legacy.steps.length; i++) {
        expectPositionsEqual(
          effectiveDefensePositions(legacy, i),
          effectiveDefensePositions(steering, i),
        );
      }
    }
  });

  it('scénario avec att absent (O3 manquant) → fallback identique', () => {
    const offMissing: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 100, y: 380 },
      // O3 absent volontairement
      O4: { x: 200, y: 200 },
      O5: { x: 400, y: 200 },
    } as AttackerPositions;
    const base = makeInitialState();
    const legacy: AppState = {
      ...base,
      steps: [{ off: offMissing, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: DEFAULT_DEF,
    };
    const steering: AppState = { ...legacy, useSteeringEngine: true };
    expectPositionsEqual(
      effectiveDefensePositions(legacy, 0),
      effectiveDefensePositions(steering, 0),
    );
  });
});
