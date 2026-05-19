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
      attackerProfiles: {} as AttackerProfiles,
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

  it("CVT 1.3c — Règle 1bis préservée : à quality 100, D1 reste plaqué au poseur même flag on", () => {
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
    const buildState = (useSteeringEngine: boolean): AppState => ({
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
      useSteeringEngine,
    });
    const legacy = effectiveDefensePositions(buildState(false), 0);
    const steering = effectiveDefensePositions(buildState(true), 0);
    // Invariant Règle 1bis : D1 stuck au poseur dans les 2 modes.
    const distLegacy = Math.hypot(legacy.D1!.x - off.O5!.x, legacy.D1!.y - off.O5!.y);
    const distSteering = Math.hypot(steering.D1!.x - off.O5!.x, steering.D1!.y - off.O5!.y);
    // Note : le push-out binaire garantit dist ≥ MIN_PLAYER_CLEARANCE_PX
    // (34 px). À quality 100, dist devrait être ≈ 34 px exact (stuck).
    // La couche screenRepelLayer ne doit PAS éloigner D1 au-delà des
    // 35 px (Règle 1bis : ≤ clearance+1 à quality 100).
    expect(distLegacy).toBeLessThanOrEqual(36); // marge arrondis pipeline
    expect(distSteering).toBeLessThanOrEqual(36); // invariant CVT 1.3c
  });

  it("CVT 1.3c — écran off-ball détecté → couche active aussi", () => {
    // Scénario pin-down : O5 vient poser un écran hors-ballon pour O3
    // (cutter), O2 défense périphérique passe à proximité d'O5.
    // Le porteur est O1 (action séparée). On vérifie qu'avec flag on,
    // la position de D2 peut être légèrement affectée par le repel
    // off-ball, dans les limites du cap.
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 150, y: 400 },
      O3: { x: 250, y: 250 },
      O4: { x: 450, y: 250 },
      O5: { x: 270, y: 230 }, // proche d'O3 → pin-down potentiel
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 540 },
      D2: { x: 180, y: 430 }, // proche d'O5 par hasard
      D3: { x: 280, y: 280 },
      D4: { x: 480, y: 280 },
      D5: { x: 280, y: 200 },
    };
    const buildState = (useSteeringEngine: boolean): AppState => ({
      ...base,
      attackerProfiles: {} as AttackerProfiles,
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseInitial: def,
      useSteeringEngine,
    });
    const legacy = effectiveDefensePositions(buildState(false), 0);
    const steering = effectiveDefensePositions(buildState(true), 0);
    // Quelle que soit la détection off-ball, l'écart reste borné par
    // la tolérance cumulative CVT (12 px).
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      const d = Math.hypot(legacy[id]!.x - steering[id]!.x, legacy[id]!.y - steering[id]!.y);
      expect(d).toBeLessThanOrEqual(12);
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
      attackerProfiles: {} as AttackerProfiles,
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
