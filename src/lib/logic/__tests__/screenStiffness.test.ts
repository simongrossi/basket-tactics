// Tests Stiffness & Impact (Physique de l'écran) — flag opt-in qui amplifie
// la pénalité de vitesse subie par un défenseur en contact ou recovery.
// Doit préserver le pipeline d'écran : seul l'effort de dégagement coûte plus.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeScreenRecoveryScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  // Step 0 : O5 pose un écran sur D1 (impact).
  const off0: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 305, y: 380 },
  };
  // Step 1 : O1 a passé l'écran, D1 tente de récupérer.
  const off1: AttackerPositions = {
    O1: { x: 380, y: 300 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 305, y: 380 },
  };
  return {
    ...base,
    steps: [
      { ...makeStep(off0, 'O1', []), forcedScreener: 'O5' as const },
      makeStep(off1, 'O1', []),
    ],
    activeStep: 1,
    screenRule: 'hedge',
    defenseInitial: {
      D1: { x: 300, y: 450 },
      D2: { x: 130, y: 410 },
      D3: { x: 470, y: 410 },
      D4: { x: 240, y: 230 },
      D5: { x: 360, y: 230 },
    },
    ...overrides,
  };
}

describe('Stiffness & Impact (screenStiffnessEnabled)', () => {
  it('amplifie la pénalité de vitesse de D1 en post-écran', () => {
    const stateOff = makeScreenRecoveryScenario({ screenStiffnessEnabled: false });
    const stateOn = makeScreenRecoveryScenario({
      screenStiffnessEnabled: true,
      screenStiffness: 2.5,
    });

    const def1Off = effectiveDefensePositions(stateOff, 1);
    const def1On = effectiveDefensePositions(stateOn, 1);
    const def0 = effectiveDefensePositions(stateOff, 0);

    const distOff = Math.hypot(def1Off.D1.x - def0.D1.x, def1Off.D1.y - def0.D1.y);
    const distOn = Math.hypot(def1On.D1.x - def0.D1.x, def1On.D1.y - def0.D1.y);

    // Avec stiffness amplifiée, D1 couvre strictement moins de distance.
    expect(distOn).toBeLessThan(distOff);
  });

  it('reste no-op quand screenStiffness = 1.0', () => {
    const stateOff = makeScreenRecoveryScenario({ screenStiffnessEnabled: false });
    const stateNoOp = makeScreenRecoveryScenario({
      screenStiffnessEnabled: true,
      screenStiffness: 1.0,
    });
    const defOff = effectiveDefensePositions(stateOff, 1);
    const defNoOp = effectiveDefensePositions(stateNoOp, 1);
    expect(defNoOp.D1.x).toBeCloseTo(defOff.D1.x, 3);
    expect(defNoOp.D1.y).toBeCloseTo(defOff.D1.y, 3);
  });

  it("n'altère pas la position cible (pipeline d'écran intouché)", () => {
    // Au step 0 (impact), la cible de D1 doit être plaquée au poseur O5
    // QUEL QUE SOIT le flag stiffness — seule la vitesse de progression vers
    // cette cible est affectée.
    const stateOff = makeScreenRecoveryScenario({ screenStiffnessEnabled: false });
    const stateOn = makeScreenRecoveryScenario({
      screenStiffnessEnabled: true,
      screenStiffness: 3.0,
    });
    const def0Off = effectiveDefensePositions(stateOff, 0);
    const def0On = effectiveDefensePositions(stateOn, 0);

    // À step 0 (premier impact), le moteur de vitesse part de l'état initial
    // donc les positions sont identiques (l'amplification n'intervient qu'à
    // partir du step où une vitesse est calculée depuis prev).
    expect(def0On.D1.x).toBeCloseTo(def0Off.D1.x, 3);
    expect(def0On.D1.y).toBeCloseTo(def0Off.D1.y, 3);
  });

  it('respecte la borne basse 0.08 (pas de paralysie même à stiffness=10)', () => {
    const state = makeScreenRecoveryScenario({
      screenStiffnessEnabled: true,
      screenStiffness: 10, // valeur absurde — la borne doit kicker
    });
    const def0 = effectiveDefensePositions(state, 0);
    const def1 = effectiveDefensePositions(state, 1);
    const dist = Math.hypot(def1.D1.x - def0.D1.x, def1.D1.y - def0.D1.y);
    // D1 doit pouvoir bouger d'au moins un pixel : pas de freeze total.
    expect(dist).toBeGreaterThan(0.5);
  });
});
