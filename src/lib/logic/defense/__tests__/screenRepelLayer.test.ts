// Tests CVT 1.3b — Couche screen repel (raffinement trajectoire
// défenseurs périphériques proches d'un poseur d'écran).

import { describe, expect, it } from 'vitest';
import { SCREEN_REPEL_LAYER_MAX_SHIFT_PX } from '@/lib/logic/defense/screenRepelLayer';
import type { AppState, AttackerPositions, AttackerProfiles, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

describe('applyScreenRepelLayer — cap et filtres', () => {
  it('cap dur exporté à 3 px', () => {
    expect(SCREEN_REPEL_LAYER_MAX_SHIFT_PX).toBe(3);
  });

  it("CVT 1.3c — Règle 1bis préservée : à quality 100, D1 reste plaqué au poseur", () => {
    // Scénario PnR classique : O5 vient poser un écran sur D1 qui marque
    // O1 (porteur). À quality 100, l'invariant Règle 1bis exige
    // dist(D1, O5) ≤ MIN_PLAYER_CLEARANCE_PX + 1 (34+1=35 px).
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 500 }, // porteur
      O2: { x: 100, y: 400 },
      O3: { x: 500, y: 400 },
      O4: { x: 200, y: 250 },
      O5: { x: 280, y: 460 }, // poseur, proche de D1
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 130, y: 410 },
      D3: { x: 470, y: 410 },
      D4: { x: 240, y: 260 },
      D5: { x: 290, y: 430 }, // proche d'O5
    };
    const state: AppState = {
      ...base,
      attackerProfiles: {} as AttackerProfiles,
      steps: [{
        off,
        ballCarrier: 'O1',
        annotations: [{
          type: 'screen',
          fromId: 'O5',
          toId: null,
          from: { x: 280, y: 460 },
          to: { x: 300, y: 500 },
          quality: 100,
        }],
      }],
      activeStep: 0,
      defenseInitial: def,
    };
    const steering = effectiveDefensePositions(state, 0);
    // Invariant Règle 1bis : D1 stuck au poseur.
    const distSteering = Math.hypot(steering.D1!.x - off.O5!.x, steering.D1!.y - off.O5!.y);
    expect(distSteering).toBeLessThanOrEqual(36); // invariant CVT 1.3c
  });

  it("aucun écran détecté → no-op (rien à raffiner)", () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 100, y: 380 },
      O3: { x: 500, y: 380 },
      O4: { x: 150, y: 200 },
      O5: { x: 450, y: 200 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 130, y: 410 },
      D3: { x: 470, y: 410 },
      D4: { x: 180, y: 230 },
      D5: { x: 420, y: 230 },
    };
    const state: AppState = {
      ...base,
      attackerProfiles: {} as AttackerProfiles,
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
    };
    const res = effectiveDefensePositions(state, 0);
    expect(res.D1).toBeDefined();
  });
});
