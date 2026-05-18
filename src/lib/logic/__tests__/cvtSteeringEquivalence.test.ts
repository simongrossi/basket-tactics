// CVT Chantier 1.1 + 1.1b — Tests d'équivalence intégrés.
//
// Vérifie que le flag `state.useSteeringEngine = true` produit des
// positions défensives ≈ identiques au pipeline legacy :
// - En **zone loin** (défenseur à ≥ `STEERING_MAN_SLOWING_RADIUS_PX`
//   de sa cible legacy) : bit-équivalent (arrive = seek dans cette zone).
// - En **zone proche** (< slowingRadius) : target amorti, déviation
//   bornée à `slowingRadius/4 ≈ 3 px`. C'est l'effet voulu (1.1b :
//   anti-oscillation), pas une régression.
//
// Tolérance retenue : `STEERING_TOLERANCE_PX = 5` — couvre l'écart
// math max (3 px) avec une marge pour les arrondis du pipeline complet
// (speedConstraint + closeout + friction).

import { describe, expect, it } from 'vitest';
import type {
  AppState,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
} from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

const STEERING_TOLERANCE_PX = 5; // borne supérieure de la déviation
                                  // anti-oscillation (slowingRadius/4 + marge)

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

function expectPositionsClose(
  a: DefenderPositions,
  b: DefenderPositions,
  tol = STEERING_TOLERANCE_PX,
): void {
  const idsA = Object.keys(a).sort() as DefenderId[];
  const idsB = Object.keys(b).sort() as DefenderId[];
  expect(idsA).toEqual(idsB);
  for (const id of idsA) {
    const pa = a[id];
    const pb = b[id];
    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(Math.abs(pa!.x - pb!.x)).toBeLessThanOrEqual(tol);
    expect(Math.abs(pa!.y - pb!.y)).toBeLessThanOrEqual(tol);
  }
}

describe('CVT 1.1 — équivalence pipeline complet (flag off vs on)', () => {
  it('scénario chase basique : positions identiques à tous les steps', () => {
    const legacy = makeScenario();
    const steering = makeScenario({ useSteeringEngine: true });
    for (let i = 0; i < legacy.steps.length; i++) {
      const dL = effectiveDefensePositions(legacy, i);
      const dS = effectiveDefensePositions(steering, i);
      expectPositionsClose(dL, dS);
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
      expectPositionsClose(
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
        expectPositionsClose(
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
    expectPositionsClose(
      effectiveDefensePositions(legacy, 0),
      effectiveDefensePositions(steering, 0),
    );
  });
});
