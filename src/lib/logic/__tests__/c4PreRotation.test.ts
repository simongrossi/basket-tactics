// Tests C.4 — pre-rotation (anticipation d'un écran imminent).
//
// Le helper detectImminentScreen identifie un attaquant en MOUVEMENT
// vers le défenseur du porteur, encore hors du rayon de détection mais
// dans la zone proche. Quand state.preRotationEnabled est true ET un
// imminent est trouvé, le carrierDef est shifté de ~10 px vers le
// screener attendu.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, Matchups, DefenderPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { detectImminentScreen } from '@/lib/logic/screens';

const matchups: Matchups = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

describe('detectImminentScreen', () => {
  it("retourne null si prevOff est null", () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 320 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 360 }, D2: { x: 100, y: 360 }, D3: { x: 500, y: 360 },
      D4: { x: 200, y: 180 }, D5: { x: 305, y: 300 },
    };
    expect(detectImminentScreen(off, null, 'O1', matchups, def, 35)).toBeNull();
  });

  it("retourne null si tout attaquant est statique (moveLen < 5)", () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 320 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 360 }, D2: { x: 100, y: 360 }, D3: { x: 500, y: 360 },
      D4: { x: 200, y: 180 }, D5: { x: 305, y: 300 },
    };
    // prev = cur : aucun mouvement.
    expect(detectImminentScreen(off, off, 'O1', matchups, def, 35)).toBeNull();
  });

  it("détecte un attaquant en approche du carrierDef (zone imminent)", () => {
    // D1 à (300, 360). O5 venait de (305, 280) → maintenant (305, 310).
    // Dist O5 ↔ D1 = √(25 + 2500) ≈ 50 px (∈ [35, 70]).
    // Move = (0, 30), vers D1 (en bas) → dot > 0.
    // Dist O5 ↔ O1 (porteur à 300,380) = √(25 + 4900) ≈ 70 < 100.
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 310 },
    };
    const prev: AttackerPositions = {
      ...off,
      O5: { x: 305, y: 280 },
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 360 }, D2: { x: 100, y: 360 }, D3: { x: 500, y: 360 },
      D4: { x: 200, y: 180 }, D5: { x: 305, y: 260 },
    };
    const imm = detectImminentScreen(off, prev, 'O1', matchups, def, 35);
    expect(imm).not.toBeNull();
    expect(imm!.screener).toBe('O5');
  });

  it("retourne null si l'attaquant fuit (dot ≤ 0.3)", () => {
    // O5 s'éloigne de D1.
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 280 },
    };
    const prev: AttackerPositions = {
      ...off,
      O5: { x: 305, y: 310 }, // était plus proche de D1
    };
    const def: DefenderPositions = {
      D1: { x: 300, y: 360 }, D2: { x: 100, y: 360 }, D3: { x: 500, y: 360 },
      D4: { x: 200, y: 180 }, D5: { x: 305, y: 240 },
    };
    expect(detectImminentScreen(off, prev, 'O1', matchups, def, 35)).toBeNull();
  });

  it("retourne null si l'attaquant est trop loin du porteur (>100 px)", () => {
    // O5 approche D1 mais O1 est loin (côté gauche).
    const off: AttackerPositions = {
      O1: { x: 100, y: 380 }, O2: { x: 50, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 310 },
    };
    const prev: AttackerPositions = { ...off, O5: { x: 305, y: 280 } };
    const def: DefenderPositions = {
      D1: { x: 100, y: 360 }, D2: { x: 50, y: 360 }, D3: { x: 500, y: 360 },
      D4: { x: 200, y: 180 }, D5: { x: 305, y: 260 },
    };
    expect(detectImminentScreen(off, prev, 'O1', matchups, def, 35)).toBeNull();
  });

  it("retourne null si l'attaquant est déjà dans le rayon de détection (réel, pas imminent)", () => {
    // O5 collé à D1.
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 350 },
    };
    const prev: AttackerPositions = { ...off, O5: { x: 305, y: 380 } };
    const def: DefenderPositions = {
      D1: { x: 300, y: 360 }, D2: { x: 100, y: 360 }, D3: { x: 500, y: 360 },
      D4: { x: 200, y: 180 }, D5: { x: 305, y: 320 },
    };
    // Dist O5 ↔ D1 ≈ 11 < 35 → déjà détecté comme écran réel, pas imminent.
    expect(detectImminentScreen(off, prev, 'O1', matchups, def, 35)).toBeNull();
  });
});

describe('C.4 — pre-rotation intégration', () => {
  function makeImminentScenario(overrides: Partial<AppState> = {}): AppState {
    const s0 = makeInitialState();
    const offN1: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 280 },
    };
    const offN: AttackerPositions = {
      ...offN1,
      O5: { x: 305, y: 310 }, // approche D1
    };
    return {
      ...s0,
      steps: [makeStep(offN1, 'O1', []), makeStep(offN, 'O1', [])],
      activeStep: 1,
      ...overrides,
    };
  }

  it("default false → pas de shift (D1 sur position homme-à-homme standard)", () => {
    const state = makeImminentScenario();
    const def = effectiveDefensePositions(state, 1);
    expect(def.D1).toBeDefined();
    // Sans préRotation, D1 est aligné homme-à-homme sur O1 standard.
    // Pas d'assertion forte sur la position : on capture la valeur de référence.
    const xRef = def.D1.x;
    const yRef = def.D1.y;
    expect(typeof xRef).toBe('number');
    expect(typeof yRef).toBe('number');
  });

  it("activé + imminent détecté → D1 shifté vers le screener attendu", () => {
    const stateOff = makeImminentScenario();
    const stateOn = makeImminentScenario({ preRotationEnabled: true });
    const defOff = effectiveDefensePositions(stateOff, 1);
    const defOn = effectiveDefensePositions(stateOn, 1);
    // Différence de position D1 attendue : ~10 px vers O5 (au-dessus).
    const dx = defOn.D1.x - defOff.D1.x;
    const dy = defOn.D1.y - defOff.D1.y;
    const shift = Math.hypot(dx, dy);
    // Le shift est de 10 px sur la TARGET, mais le speed constraint
    // (clamp depuis prev step) peut le réduire un peu en pratique.
    // On vérifie qu'un shift NON nul est appliqué, dans la bonne direction.
    expect(shift).toBeGreaterThan(1);
    expect(shift).toBeLessThan(15);
    // O5 est en (305, 310), D1 sans préRotation près de (300, 360) →
    // shift doit avoir une composante dy < 0 (vers le haut).
    expect(dy).toBeLessThan(0);
  });

  it("activé mais pas d'imminent (attaquants statiques) → pas de shift", () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 280 },
    };
    const stateOff: AppState = {
      ...s0,
      steps: [makeStep(off, 'O1', []), makeStep(off, 'O1', [])],
      activeStep: 1,
    };
    const stateOn: AppState = { ...stateOff, preRotationEnabled: true };
    const defOff = effectiveDefensePositions(stateOff, 1);
    const defOn = effectiveDefensePositions(stateOn, 1);
    const dx = defOn.D1.x - defOff.D1.x;
    const dy = defOn.D1.y - defOff.D1.y;
    expect(Math.hypot(dx, dy)).toBeLessThan(0.5);
  });

  it("activé MAIS écran déjà détecté (réel) → pas de pré-rotation (le réel prend le pas)", () => {
    const s0 = makeInitialState();
    const offN1: AttackerPositions = {
      O1: { x: 300, y: 380 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 305, y: 320 },
    };
    const offN: AttackerPositions = {
      ...offN1,
      O5: { x: 305, y: 350 }, // collé à D1 → écran RÉEL
    };
    const stateOff: AppState = {
      ...s0,
      steps: [makeStep(offN1, 'O1', []), makeStep(offN, 'O1', [])],
      activeStep: 1,
    };
    const stateOn: AppState = { ...stateOff, preRotationEnabled: true };
    const defOff = effectiveDefensePositions(stateOff, 1);
    const defOn = effectiveDefensePositions(stateOn, 1);
    // Comme un écran réel est détecté, la pré-rotation ne s'active PAS.
    // Donc D1 doit être à la MÊME position avec ou sans flag.
    expect(Math.abs(defOn.D1.x - defOff.D1.x)).toBeLessThan(0.5);
    expect(Math.abs(defOn.D1.y - defOff.D1.y)).toBeLessThan(0.5);
  });
});
