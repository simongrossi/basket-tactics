// Tests G.2 — Sprint boost contextuel.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeRunoutScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  const off1: AttackerPositions = {
    O1: { x: 300, y: 180 }, // run-out vers le panier (~300 px)
    O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
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

describe('G.2 — step.sprintBoost', () => {
  it('default false → comportement vitesse normal', () => {
    const state = makeRunoutScenario();
    const def0 = effectiveDefensePositions(state, 0);
    const def1 = effectiveDefensePositions(state, 1);
    const dist = Math.hypot(def1.D1.x - def0.D1.x, def1.D1.y - def0.D1.y);
    expect(dist).toBeGreaterThan(0);
    // Sans sprint, distance bornée par maxSpeed standard (~145 + closeout).
    expect(dist).toBeLessThan(220);
  });

  it('sprintBoost = true → distance parcourue significativement supérieure', () => {
    const stateStd = makeRunoutScenario();
    const stateSprint = makeRunoutScenario();
    stateSprint.steps[1] = { ...stateSprint.steps[1], sprintBoost: true };
    const stdD0 = effectiveDefensePositions(stateStd, 0);
    const stdD1 = effectiveDefensePositions(stateStd, 1);
    const sprD0 = effectiveDefensePositions(stateSprint, 0);
    const sprD1 = effectiveDefensePositions(stateSprint, 1);
    const stdDist = Math.hypot(stdD1.D1.x - stdD0.D1.x, stdD1.D1.y - stdD0.D1.y);
    const sprDist = Math.hypot(sprD1.D1.x - sprD0.D1.x, sprD1.D1.y - sprD0.D1.y);
    expect(sprDist).toBeGreaterThan(stdDist);
    // Le multiplicateur 1.8 doit donner au moins +30% de distance.
    expect(sprDist / stdDist).toBeGreaterThan(1.3);
  });

  it("sprintBoost cumulable avec G.4 'elite' (ratio supérieur)", () => {
    const stateBase = makeRunoutScenario();
    const stateBoth = makeRunoutScenario({
      defenderSpeedProfiles: { D1: 'elite' },
    });
    stateBoth.steps[1] = { ...stateBoth.steps[1], sprintBoost: true };
    const baseD0 = effectiveDefensePositions(stateBase, 0);
    const baseD1 = effectiveDefensePositions(stateBase, 1);
    const bothD0 = effectiveDefensePositions(stateBoth, 0);
    const bothD1 = effectiveDefensePositions(stateBoth, 1);
    const baseDist = Math.hypot(baseD1.D1.x - baseD0.D1.x, baseD1.D1.y - baseD0.D1.y);
    const bothDist = Math.hypot(bothD1.D1.x - bothD0.D1.x, bothD1.D1.y - bothD0.D1.y);
    // Sprint×1.8 + elite×1.3 = théorique ×2.34 du base.
    expect(bothDist / baseDist).toBeGreaterThan(1.5);
  });

  it("sprintBoost = false explicite → équivalent à undefined", () => {
    const sA = makeRunoutScenario();
    const sB = makeRunoutScenario();
    sB.steps[1] = { ...sB.steps[1], sprintBoost: false };
    const a = effectiveDefensePositions(sA, 1);
    const b = effectiveDefensePositions(sB, 1);
    expect(a.D1.x).toBeCloseTo(b.D1.x, 5);
    expect(a.D1.y).toBeCloseTo(b.D1.y, 5);
  });
});
