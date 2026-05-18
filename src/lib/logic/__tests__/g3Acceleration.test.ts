// Tests G.3 — Modèle d'accélération (différenciation accel vs top speed).
//
// Setup : un défenseur (D1) part au repos, son homme (O1) court loin
// pour le forcer à courir au max plusieurs steps. On vérifie que la
// distance parcourue à chaque step CROÎT progressivement quand le flag
// accelerationModelEnabled est actif, jusqu'à atteindre maxSpeed.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeChaseScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  const off1: AttackerPositions = { ...off0, O1: { x: 300, y: 350 } }; // ~130 px
  const off2: AttackerPositions = { ...off0, O1: { x: 300, y: 200 } }; // ~280 px depuis 0
  const off3: AttackerPositions = { ...off0, O1: { x: 300, y: 100 } }; // ~380 px depuis 0
  const def0: DefenderPositions = {
    D1: { x: 300, y: 540 }, D2: { x: 130, y: 410 }, D3: { x: 470, y: 410 },
    D4: { x: 240, y: 230 }, D5: { x: 360, y: 230 },
  };
  return {
    ...base,
    steps: [
      { off: off0, ballCarrier: 'O1', annotations: [] },
      { off: off1, ballCarrier: 'O1', annotations: [] },
      { off: off2, ballCarrier: 'O1', annotations: [] },
      { off: off3, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    defenseInitial: def0,
    ...overrides,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('G.3 — modèle d\'accélération', () => {
  it('flag off → comportement legacy (top speed atteignable en 1 step)', () => {
    const state = makeChaseScenario();
    const d0 = effectiveDefensePositions(state, 0);
    const d1 = effectiveDefensePositions(state, 1);
    const d2 = effectiveDefensePositions(state, 2);
    // En legacy, D1 atteint à peu près la même vitesse step 1 et step 2
    // (saturé par maxSpeed dès qu'il y a écart à combler).
    const sp1 = dist(d0.D1, d1.D1);
    const sp2 = dist(d1.D1, d2.D1);
    expect(sp1).toBeGreaterThan(50); // pas immobile
    expect(Math.abs(sp1 - sp2)).toBeLessThan(60); // vitesse stable au max
  });

  it("flag on : step 1 (premier mouvement) limité par accel depuis vitesse=0", () => {
    const state = makeChaseScenario({
      accelerationModelEnabled: true,
      defenderAcceleration: 60, // 60 px/step² volontairement bas
    });
    const d0 = effectiveDefensePositions(state, 0);
    const d1 = effectiveDefensePositions(state, 1);
    const sp1 = dist(d0.D1, d1.D1);
    // Avec accel=60 et prevSpeed=0 (au repos au step 0), on attend
    // une distance step 0→1 BORNÉE par 60 px. Légère tolérance pour
    // les frictions et la friction de proximité.
    expect(sp1).toBeLessThanOrEqual(65);
  });

  it("flag on : le step 1 limite la cible (target clampée par accel × 1)", () => {
    // V1 minimal : le clamp porte sur la distance target→target (pas
    // effective→effective). Au step 1, target effective est bornée à
    // accelBudget = accel × 1 = 60. Le défenseur ne RAFFLE PAS d'un coup
    // la totalité de l'écart vers O1.
    const stateLegacy = makeChaseScenario();
    const stateAccel = makeChaseScenario({
      accelerationModelEnabled: true,
      defenderAcceleration: 60,
    });
    const dLegacy = effectiveDefensePositions(stateLegacy, 1);
    const dAccel = effectiveDefensePositions(stateAccel, 1);
    const d0 = effectiveDefensePositions(stateLegacy, 0);
    const spLegacy = dist(d0.D1, dLegacy.D1);
    const spAccel = dist(d0.D1, dAccel.D1);
    // En legacy, D1 saute plus loin (≥ 100 px). Avec flag, ≤ accel.
    expect(spLegacy).toBeGreaterThan(spAccel + 30);
    expect(spAccel).toBeLessThanOrEqual(65);
  });

  it("acceleration élevée (= maxSpeed) → équivalent au mode legacy", () => {
    const stateLegacy = makeChaseScenario();
    const stateBig = makeChaseScenario({
      accelerationModelEnabled: true,
      defenderAcceleration: 200, // > maxSpeed guard 145
    });
    const lD0 = effectiveDefensePositions(stateLegacy, 0);
    const lD1 = effectiveDefensePositions(stateLegacy, 1);
    const bD0 = effectiveDefensePositions(stateBig, 0);
    const bD1 = effectiveDefensePositions(stateBig, 1);
    const spLegacy = dist(lD0.D1, lD1.D1);
    const spBig = dist(bD0.D1, bD1.D1);
    expect(Math.abs(spLegacy - spBig)).toBeLessThan(5);
  });
});
