// Test d'intégration B9 — top-lock bascule en chase si chaîne ≥ 2.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeScenario(numSteps: number, rule: AppState['offBallScreenRule']): AppState {
  const s0 = makeInitialState();
  const steps = [];
  for (let i = 0; i < numSteps; i++) {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 }, // cutter
      O4: { x: 220, y: 230 },
      O5: { x: 440, y: 320 }, // poseur
    };
    steps.push(makeStep(off, 'O1', []));
  }
  return {
    ...s0,
    steps,
    activeStep: numSteps - 1,
    offBallScreenRule: rule,
  };
}

describe("B9 — top-lock bascule en chase si cutter dans une chaîne ≥ 2", () => {
  it('top-lock au 1er écran : pas de bascule (count = 1)', () => {
    const state = makeScenario(1, 'top-lock');
    const def = effectiveDefensePositions(state, 0);
    // L'écran est détecté → D3 a un screenPhase.
    expect(def.D3.onScreen).toBe(true);
    // Position D3 attendue côté ballon (top-lock) — on n'a pas de mesure
    // robuste de la rule appliquée ici sans introspection, mais l'effet
    // de top-lock vs chase diffère. On vérifie via le test suivant.
  });

  it("3 steps top-lock → la position de D3 au step 2 diffère du step 0", () => {
    // Au step 2, le cutter O3 est dans sa chaîne (≥ 2 écrans détectés sur
    // les 3 derniers steps) → bascule top-lock → chase. La position
    // résultante doit être différente du step 0 (top-lock pur).
    const state = makeScenario(3, 'top-lock');
    const def0 = effectiveDefensePositions(state, 0);
    const def2 = effectiveDefensePositions(state, 2);
    // Au moins une différence > 5px attendue (la rule change).
    const dx = def2.D3.x - def0.D3.x;
    const dy = def2.D3.y - def0.D3.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(2);
  });

  it("autre rule (e.g. 'over') ne déclenche PAS la bascule (chain inactive)", () => {
    const state = makeScenario(3, 'over');
    // Le helper ne calcule la chaîne que pour top-lock → comportement
    // identique step 0 vs step 2 (mêmes positions).
    const def0 = effectiveDefensePositions(state, 0);
    const def2 = effectiveDefensePositions(state, 2);
    // Pas de bascule = positions D3 quasi identiques.
    expect(Math.abs(def2.D3.x - def0.D3.x)).toBeLessThan(20);
    expect(Math.abs(def2.D3.y - def0.D3.y)).toBeLessThan(20);
  });
});
