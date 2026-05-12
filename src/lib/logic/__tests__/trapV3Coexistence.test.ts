// Tests Trap v3 — coexistence trap + écran porteur.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions, Matchups } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { pickTrapHelper } from '@/lib/logic/trap';

/** Construit un état où :
 *  - O1 (porteur) est dans le coin baseline gauche (zone de trap).
 *  - O5 (poseur potentiel) est collé à D1 si forcedScreener.
 *  - Trigger trap activé. */
function makeTrapInCornerState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    triggers: { ...s0.triggers, trap: true },
    steps: [
      {
        ...s0.steps[0],
        off: {
          ...s0.steps[0].off,
          O1: { x: 80, y: 120 }, // coin baseline gauche
          O5: { x: 110, y: 145 }, // proche pour potentiellement poser un écran sur D1
        },
        ballCarrier: 'O1',
      },
    ],
    ...overrides,
  };
}

describe('Trap v3 — coexistence trap + écran', () => {
  it("trap appliqué sans écran (cas standard, déjà couvert v2)", () => {
    const state = makeTrapInCornerState();
    const def = effectiveDefensePositions(state, 0);
    // Le porteur est en zone trap → un défenseur ≠ D1 doit être venu trapper.
    // On vérifie qu'au moins un défenseur ≠ D1 est dans les 80px d'O1.
    const o1 = state.steps[0].off.O1;
    const trappers = (['D2', 'D3', 'D4', 'D5'] as const).filter((d) => {
      const dist = Math.hypot(def[d].x - o1.x, def[d].y - o1.y);
      return dist < 80;
    });
    expect(trappers.length).toBeGreaterThanOrEqual(1);
  });

  it("v3 : trap ACTIVÉ même avec un écran porteur (rule 'over')", () => {
    // Force O5 comme poseur d'écran tout en gardant O1 en zone trap.
    const state = makeTrapInCornerState({
      screenRule: 'over',
      steps: [
        {
          ...makeInitialState().steps[0],
          off: {
            O1: { x: 80, y: 120 },
            O2: { x: 130, y: 380 },
            O3: { x: 470, y: 380 },
            O4: { x: 220, y: 230 },
            O5: { x: 110, y: 145 }, // écran collé à D1
          },
          ballCarrier: 'O1',
          forcedScreener: 'O5',
        },
      ],
    });
    const def = effectiveDefensePositions(state, 0);
    const o1 = state.steps[0].off.O1;
    // Au moins un défenseur ≠ D1 ET ≠ D5 (screenerDef) est venu trapper.
    const trappers = (['D2', 'D3', 'D4'] as const).filter((d) => {
      const dist = Math.hypot(def[d].x - o1.x, def[d].y - o1.y);
      return dist < 80;
    });
    expect(trappers.length).toBeGreaterThanOrEqual(1);
  });

  it("v3 : rule 'blitz' → PAS de trap additionnel (la rule fait le trap)", () => {
    const state = makeTrapInCornerState({
      screenRule: 'blitz',
      steps: [
        {
          ...makeInitialState().steps[0],
          off: {
            O1: { x: 80, y: 120 },
            O2: { x: 130, y: 380 },
            O3: { x: 470, y: 380 },
            O4: { x: 220, y: 230 },
            O5: { x: 110, y: 145 },
          },
          ballCarrier: 'O1',
          forcedScreener: 'O5',
        },
      ],
    });
    // Avec blitz, applyScreenAdjustment place D1 ET D5 en trap sur le porteur.
    // La couche trap ne doit PAS faire venir un D2/D3/D4 supplémentaire.
    // Comparaison : positions de D2/D3/D4 doivent être proches de leur
    // position de défense naturelle (loin du porteur).
    const def = effectiveDefensePositions(state, 0);
    const o1 = state.steps[0].off.O1;
    const trappers = (['D2', 'D3', 'D4'] as const).filter((d) => {
      const dist = Math.hypot(def[d].x - o1.x, def[d].y - o1.y);
      return dist < 60;
    });
    // Aucun ne doit avoir été tiré dans le trap par la couche trap (le blitz
    // s'occupe déjà du couple D1/D5).
    expect(trappers.length).toBe(0);
  });

  it("v3 : rule 'switch' → PAS de trap (matchups swappés, sens perdu)", () => {
    const state = makeTrapInCornerState({
      screenRule: 'switch',
      steps: [
        {
          ...makeInitialState().steps[0],
          off: {
            O1: { x: 80, y: 120 },
            O2: { x: 130, y: 380 },
            O3: { x: 470, y: 380 },
            O4: { x: 220, y: 230 },
            O5: { x: 110, y: 145 },
          },
          ballCarrier: 'O1',
          forcedScreener: 'O5',
        },
      ],
    });
    const def = effectiveDefensePositions(state, 0);
    const o1 = state.steps[0].off.O1;
    // Après switch, D5 défend O1 (mais c'est dans son matchup naturel maintenant).
    // Aucun défenseur additionnel ne vient trapper.
    const additionalTrappers = (['D2', 'D3', 'D4'] as const).filter((d) => {
      const dist = Math.hypot(def[d].x - o1.x, def[d].y - o1.y);
      return dist < 60;
    });
    expect(additionalTrappers.length).toBe(0);
  });
});

describe('pickTrapHelper — exclusion (v3)', () => {
  const off: AttackerPositions = {
    O1: { x: 80, y: 120 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 380, y: 230 },
  };
  const defPos: DefenderPositions = {
    D1: { x: 100, y: 130 }, // proche d'O1
    D2: { x: 150, y: 200 }, // candidat trap naturel
    D3: { x: 200, y: 250 },
    D4: { x: 300, y: 300 },
    D5: { x: 400, y: 400 },
  };
  const matchups: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };

  it("sans exclusion : choisit le plus proche (D2)", () => {
    const helper = pickTrapHelper(off, defPos, matchups, 'O1');
    expect(helper).toBe('D2');
  });

  it("avec exclusion D2 : choisit D3", () => {
    const helper = pickTrapHelper(off, defPos, matchups, 'O1', new Set(['D2']));
    expect(helper).toBe('D3');
  });

  it("exclusion + carrierDef toujours excluse", () => {
    // D1 (carrierDef) jamais retenu, même si l'exclusion ne le mentionne pas.
    const helper = pickTrapHelper(off, defPos, matchups, 'O1', new Set());
    expect(helper).not.toBe('D1');
  });
});
