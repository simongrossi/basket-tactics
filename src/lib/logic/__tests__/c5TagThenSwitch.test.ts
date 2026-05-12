// Tests C.5 — tag-then-switch dynamic.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un AppState avec un PnR où O5 vient de poser un écran sur D1
 *  ET le roller (O5) est proche du panier. */
function makePnRRollState(rollerNearHoop: boolean, overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  // N-1 : O5 a posé écran sur D1, O1 dribble.
  const offN1: AttackerPositions = {
    O1: { x: 300, y: 380 },
    O2: { x: 100, y: 380 },
    O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 },
    O5: { x: 305, y: 350 }, // écran top
  };
  // N : O5 roule vers le panier (HOOP = 300, 75). Si rollerNearHoop, dist < 150.
  const rollerPos = rollerNearHoop
    ? { x: 305, y: 200 } // dist au panier ≈ 125 < 150 → trigger
    : { x: 305, y: 320 }; // dist au panier ≈ 245 → pas de trigger
  const offN: AttackerPositions = {
    ...offN1,
    O1: { x: 280, y: 350 }, // continue le dribble
    O5: rollerPos,
  };
  return {
    ...s0,
    steps: [
      makeStep(offN1, 'O1', []),
      { ...makeStep(offN, 'O1', []), forcedScreener: 'O5' },
    ],
    activeStep: 1,
    screenRule: 'drop', // permet le tag (pas switch / hedge)
    triggers: { drive: true, post: true, paint: true },
    ...overrides,
  };
}

describe('C.5 — tag-then-switch', () => {
  it("default false → comportement legacy (tag classique, low man recover)", () => {
    const state = makePnRRollState(true); // pas de tagThenSwitchEnabled
    const def = effectiveDefensePositions(state, 1);
    // Le low man (D4 ou D5 selon proximité) reste sur son matchup ORIGINAL.
    // Pas de switch. Matchups inchangés.
    expect(def.D5.matchedTo).toBe('O5');
    // D1 défend O1 standard
    expect(def.D1.matchedTo).toBe('O1');
  });

  it("activé + roller proche panier → switch (low man prend roller)", () => {
    const state = makePnRRollState(true, { tagThenSwitchEnabled: true });
    const def = effectiveDefensePositions(state, 1);
    // Identifier le low man (= le défenseur ≠ carrierDef ≠ screenerDef
    // le plus proche du roller). Selon les positions, ce sera D4 ou autre.
    // On vérifie que les matchups ont été swappés : il existe au moins
    // 2 défenseurs avec switchedThisStep=true ET un défenseur ≠ D5 défend
    // maintenant O5.
    const switchedCount = (['D1', 'D2', 'D3', 'D4', 'D5'] as const)
      .filter((d) => def[d].switchedThisStep)
      .length;
    expect(switchedCount).toBeGreaterThanOrEqual(2);
    // O5 (roller) doit être défendu par quelqu'un ≠ D5.
    const guardOfO5 = (['D1', 'D2', 'D3', 'D4', 'D5'] as const)
      .find((d) => def[d].matchedTo === 'O5');
    expect(guardOfO5).toBeDefined();
    expect(guardOfO5).not.toBe('D5');
  });

  it("activé + roller LOIN du panier → pas de switch (seuil 150px non atteint)", () => {
    const state = makePnRRollState(false, { tagThenSwitchEnabled: true });
    const def = effectiveDefensePositions(state, 1);
    // Roller à 245px du panier → > 150 → pas de switch.
    expect(def.D5.matchedTo).toBe('O5');
  });

  it("activé sans PnR action (carrier statique) → pas de tag donc pas de switch", () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 380 },
      O2: { x: 100, y: 380 },
      O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 },
      O5: { x: 305, y: 350 },
    };
    // 3 steps identiques → pas d'action PnR détectée (pas de roll).
    const state: AppState = {
      ...s0,
      steps: [makeStep(off, 'O1', []), makeStep(off, 'O1', []), makeStep(off, 'O1', [])],
      activeStep: 2,
      screenRule: 'drop',
      tagThenSwitchEnabled: true,
    };
    const def = effectiveDefensePositions(state, 2);
    // Pas de tag → pas de switch → matchups inchangés.
    expect(def.D5.matchedTo).toBe('O5');
  });
});
