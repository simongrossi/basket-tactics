// Tests G.4 — Profil athlétique des défenseurs.
//
// Vérifie le multiplicateur sur la vitesse max effective via la trajectoire
// step→step. Setup minimal : un défenseur seul, on mesure la distance
// parcourue entre 2 steps avec et sans profile.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Setup : D1 part loin de O1 (son matched). On mesure jusqu'où il
 *  arrive en 1 step selon le profil. Le moteur clamp sa vitesse à
 *  rule.maxSpeed × profileMultiplier. */
function makeSpeedScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  const off1: AttackerPositions = {
    O1: { x: 300, y: 200 }, // Le porteur a couru loin → D1 doit suivre
    O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  // D1 en arrière au step 0, doit rejoindre O1 au step 1.
  const def0: DefenderPositions = {
    D1: { x: 300, y: 540 }, D2: { x: 130, y: 410 }, D3: { x: 470, y: 410 },
    D4: { x: 240, y: 230 }, D5: { x: 360, y: 230 },
  };
  return {
    ...base,
    steps: [
      { off: off0, ballCarrier: 'O1', annotations: [] },
      { off: off1, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    defenseInitial: def0,
    ...overrides,
  };
}

describe('G.4 — defenderSpeedProfiles', () => {
  it('default (pas de profile) → distance parcourue par D1 = maxSpeed standard', () => {
    const state = makeSpeedScenario();
    const def0 = effectiveDefensePositions(state, 0);
    const def1 = effectiveDefensePositions(state, 1);
    const dist = Math.hypot(def1.D1.x - def0.D1.x, def1.D1.y - def0.D1.y);
    // Distance attendue : limitée à rule.maxSpeed ≈ 145 (guard).
    // Tolérance large parce que d'autres facteurs modulent (closeout, friction).
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThanOrEqual(200);
  });

  it("profile 'elite' → distance parcourue strictement supérieure à standard", () => {
    const stateStd = makeSpeedScenario();
    const stateElite = makeSpeedScenario({
      defenderSpeedProfiles: { D1: 'elite' },
    });
    const stdDef0 = effectiveDefensePositions(stateStd, 0);
    const stdDef1 = effectiveDefensePositions(stateStd, 1);
    const eliteDef0 = effectiveDefensePositions(stateElite, 0);
    const eliteDef1 = effectiveDefensePositions(stateElite, 1);
    const stdDist = Math.hypot(stdDef1.D1.x - stdDef0.D1.x, stdDef1.D1.y - stdDef0.D1.y);
    const eliteDist = Math.hypot(eliteDef1.D1.x - eliteDef0.D1.x, eliteDef1.D1.y - eliteDef0.D1.y);
    expect(eliteDist).toBeGreaterThan(stdDist);
  });

  it("profile 'lent' → distance parcourue strictement inférieure à standard", () => {
    const stateStd = makeSpeedScenario();
    const stateLent = makeSpeedScenario({
      defenderSpeedProfiles: { D1: 'lent' },
    });
    const stdDef0 = effectiveDefensePositions(stateStd, 0);
    const stdDef1 = effectiveDefensePositions(stateStd, 1);
    const lentDef0 = effectiveDefensePositions(stateLent, 0);
    const lentDef1 = effectiveDefensePositions(stateLent, 1);
    const stdDist = Math.hypot(stdDef1.D1.x - stdDef0.D1.x, stdDef1.D1.y - stdDef0.D1.y);
    const lentDist = Math.hypot(lentDef1.D1.x - lentDef0.D1.x, lentDef1.D1.y - lentDef0.D1.y);
    expect(lentDist).toBeLessThan(stdDist);
  });

  it("profile 'standard' explicite → équivalent à pas de profile (×1.0)", () => {
    const stateImplicit = makeSpeedScenario();
    const stateExplicit = makeSpeedScenario({
      defenderSpeedProfiles: { D1: 'standard' },
    });
    const a = effectiveDefensePositions(stateImplicit, 1);
    const b = effectiveDefensePositions(stateExplicit, 1);
    expect(a.D1.x).toBeCloseTo(b.D1.x, 5);
    expect(a.D1.y).toBeCloseTo(b.D1.y, 5);
  });

  it("ratio elite/lent ≈ 1.3/0.7 ≈ 1.86 sur la distance parcourue", () => {
    const stateElite = makeSpeedScenario({ defenderSpeedProfiles: { D1: 'elite' } });
    const stateLent = makeSpeedScenario({ defenderSpeedProfiles: { D1: 'lent' } });
    const eD0 = effectiveDefensePositions(stateElite, 0);
    const eD1 = effectiveDefensePositions(stateElite, 1);
    const lD0 = effectiveDefensePositions(stateLent, 0);
    const lD1 = effectiveDefensePositions(stateLent, 1);
    const eliteDist = Math.hypot(eD1.D1.x - eD0.D1.x, eD1.D1.y - eD0.D1.y);
    const lentDist = Math.hypot(lD1.D1.x - lD0.D1.x, lD1.D1.y - lD0.D1.y);
    // Ratio attendu : 1.3/0.7 ≈ 1.857. Tolérance large pour les
    // modulations annexes (friction, closeout).
    const ratio = eliteDist / lentDist;
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(2.4);
  });
});
