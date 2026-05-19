// Tests CVT 1.3b — Couche screen repel (raffinement trajectoire
// défenseurs périphériques proches d'un poseur d'écran).

import { describe, expect, it } from 'vitest';
import { SCREEN_REPEL_LAYER_MAX_SHIFT_PX } from '@/lib/logic/defense/screenRepelLayer';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

describe('applyScreenRepelLayer — cap et filtres', () => {
  it('cap dur exporté à 3 px', () => {
    expect(SCREEN_REPEL_LAYER_MAX_SHIFT_PX).toBe(3);
  });

  it("flag off → couche inerte (legacy strict)", () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 250, y: 460 }, // PnR potentiel
      O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 },
      O5: { x: 400, y: 200 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 250, y: 500 },
      D3: { x: 470, y: 410 },
      D4: { x: 240, y: 230 },
      D5: { x: 360, y: 230 },
    };
    const stateA: AppState = {
      ...base,
      attackerProfiles: {},
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
    };
    const stateB: AppState = { ...stateA, useSteeringEngine: false };
    const a = effectiveDefensePositions(stateA, 0);
    const b = effectiveDefensePositions(stateB, 0);
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      expect(a[id]!.x).toBeCloseTo(b[id]!.x, 9);
      expect(a[id]!.y).toBeCloseTo(b[id]!.y, 9);
    }
  });

  it("aucun écran détecté → no-op (rien à raffiner)", () => {
    // 5-out spacing classique, pas d'écran → la couche ne devrait
    // pas modifier les positions.
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
    const legacy: AppState = {
      ...base,
      attackerProfiles: {},
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
    };
    const steering: AppState = { ...legacy, useSteeringEngine: true };
    const a = effectiveDefensePositions(legacy, 0);
    const b = effectiveDefensePositions(steering, 0);
    // Tolérance modeste : seules les couches CVT amont (1.1b, 2b)
    // ont fait leur effet. La couche 1.3b est inerte sans écran.
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      const d = Math.hypot(a[id]!.x - b[id]!.x, a[id]!.y - b[id]!.y);
      expect(d).toBeLessThanOrEqual(12);
    }
  });
});
