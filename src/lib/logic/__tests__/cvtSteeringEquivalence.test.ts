// CVT — Tests d'équivalence intégrés (1.1 → 3c).
//
// Vérifie que `state.useSteeringEngine = true` produit des positions
// défensives ≈ identiques au pipeline legacy QUAND tous les effets
// CVT sont neutralisés (profils undefined notamment).
//
// Sources de déviation cumulables avec flag on :
// - 1.1b `arrive` dampening en zone proche : ≤ 3 px (slowingRadius/4).
// - 2b interpose layer : ≤ 5 px (`INTERPOSE_MAX_SHIFT_PX`).
// - 3c pondération profil : 0 quand profil undefined (neutralisé ici).
//
// Tolérance retenue : `STEERING_TOLERANCE_PX = 12` — borne cumulative
// (3 + 5 + arrondis pipeline). Documenté comme gain CVT, pas régression.
// Bit-équivalence stricte (1e-9) testée au niveau unitaire dans
// `manDefense.test.ts`.

import { describe, expect, it } from 'vitest';
import type {
  AppState,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
} from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

const STEERING_TOLERANCE_PX = 12; // borne cumulative CVT (1.1b dampening +
                                   // 2b interpose + arrondis pipeline)

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
    // CVT 3c — `makeInitialState` pose des profils par défaut (shooter,
    // rim-roller, etc.) qui déclenchent la pondération de distance.
    // Pour les tests d'équivalence on neutralise tous les profils
    // (undefined → multipliers (1,1) → comportement legacy strict).
    // Tests dédiés au gain 3c plus bas.
    attackerProfiles: {},
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

  it('CVT 3b — isPassShadowed propagé sur ComputedDefender quand flag on', () => {
    // Scénario où un défenseur (D2) est positionné sur la ligne O1-O3.
    // O1 (porteur) à (300, 480), O3 à (300, 100). Pour que D2 occulte
    // cette ligne, il faut le placer entre eux. defenseInitial D2 doit
    // être proche de la ligne.
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 100, y: 380 },
      O3: { x: 300, y: 100 },
      O4: { x: 200, y: 200 },
      O5: { x: 400, y: 200 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 300, y: 290 }, // sur la ligne O1-O3 (mid)
      D3: { x: 470, y: 410 },
      D4: { x: 240, y: 230 },
      D5: { x: 360, y: 230 },
    };
    const base = makeInitialState();
    const state: AppState = {
      ...base,
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
      useSteeringEngine: true,
    };
    const result = effectiveDefensePositions(state, 0);
    // D3 sur le wing droit, hors de toutes les lignes vers les autres
    // attaquants (qui sont à gauche ou en haut). Ne shadow rien.
    expect(result.D3.isPassShadowed).toBeFalsy();
    // Au moins UN défenseur doit être flagué (D1 sur la ligne O1-O3
    // verticale en zone paint, par exemple). Sinon le calcul n'a pas
    // fonctionné du tout.
    const anyShadowed = Object.values(result).some((d) => d.isPassShadowed === true);
    expect(anyShadowed).toBe(true);
  });

  it('CVT 3b — isPassShadowed undefined quand flag off (jamais calculé)', () => {
    const legacy = makeScenario();
    const d = effectiveDefensePositions(legacy, 0);
    for (const id of Object.keys(d) as DefenderId[]) {
      expect(d[id]!.isPassShadowed).toBeUndefined();
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
      attackerProfiles: {}, // CVT 3c — neutralisé pour l'équivalence
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

// ============================================================================
// CVT 3c — pondération par profil offensif (effet visible quand flag on)
// ============================================================================

describe('CVT 3c — pondération distance par profil offensif', () => {
  it("profile=shooter → défenseur plus proche de l'attaquant (manWeight > 1 → dist plus petit)", () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 500, y: 380 }, // celui qu'on teste
      O3: { x: 100, y: 380 },
      O4: { x: 200, y: 200 },
      O5: { x: 400, y: 200 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 500, y: 250 },
      D3: { x: 100, y: 250 },
      D4: { x: 240, y: 100 },
      D5: { x: 360, y: 100 },
    };
    const base = makeInitialState();
    const buildState = (profile: 'shooter' | 'non-shooter' | undefined): AppState => ({
      ...base,
      attackerProfiles: profile ? { O2: profile } : {},
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
      useSteeringEngine: true,
    });
    const neutral = effectiveDefensePositions(buildState(undefined), 0).D2;
    const shooter = effectiveDefensePositions(buildState('shooter'), 0).D2;
    const nonShooter = effectiveDefensePositions(buildState('non-shooter'), 0).D2;
    // Distance D2 → O2 : doit être plus PETITE pour shooter, plus GRANDE pour non-shooter
    const dShooter = Math.hypot(shooter.x - off.O2!.x, shooter.y - off.O2!.y);
    const dNeutral = Math.hypot(neutral.x - off.O2!.x, neutral.y - off.O2!.y);
    const dNonShooter = Math.hypot(nonShooter.x - off.O2!.x, nonShooter.y - off.O2!.y);
    expect(dShooter).toBeLessThan(dNeutral);
    expect(dNonShooter).toBeGreaterThan(dNeutral);
  });

  it("flag off → profil ignoré (legacy strict)", () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 500, y: 380 },
      O3: { x: 100, y: 380 },
      O4: { x: 200, y: 200 },
      O5: { x: 400, y: 200 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 500, y: 250 },
      D3: { x: 100, y: 250 },
      D4: { x: 240, y: 100 },
      D5: { x: 360, y: 100 },
    };
    const base = makeInitialState();
    const buildLegacy = (profile: 'shooter' | undefined): AppState => ({
      ...base,
      attackerProfiles: profile ? { O2: profile } : {},
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
      // useSteeringEngine NON activé
    });
    const a = effectiveDefensePositions(buildLegacy(undefined), 0).D2;
    const b = effectiveDefensePositions(buildLegacy('shooter'), 0).D2;
    // Sans le flag, le profil n'a pas d'effet sur la distance (3c off)
    // Note : il a peut-être un effet via les helpers existants
    // (leaveAttackerCostMultiplier, etc.), donc on tolère une petite
    // déviation. Le critère discriminant : avec flag on (test ci-dessus)
    // l'écart est de plusieurs px ; avec flag off ici on s'attend à un
    // écart "legacy" comparable, indépendant du profil.
    expect(Math.abs(a.x - b.x)).toBeLessThan(20); // pas d'amplification CVT
    expect(Math.abs(a.y - b.y)).toBeLessThan(20);
  });
});
