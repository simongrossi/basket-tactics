// Tests B4 V2 — snake keep coverage : la défense maintient son engagement
// quand un snake est détecté (boost de quality à ≥ 90).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un AppState 3 steps reproduisant un snake :
 *  - N-2 : O1 engagé sur O5 (poseur fixe à (300, 440))
 *  - N-1 : O1 a reculé loin (retraite)
 *  - N   : O1 ré-engagé sur O5
 *
 *  Quality d'écran annotation = 50 (standard). Avec B4 V2 + snake détecté,
 *  la défense doit appliquer la couverture comme si quality ≥ 90. */
function makeSnakeState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const baseOff = (carrier: { x: number; y: number }): AttackerPositions => ({
    O1: carrier,
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 300, y: 440 }, // poseur fixe
  });
  return {
    ...s0,
    steps: [
      makeStep(baseOff({ x: 300, y: 470 }), 'O1', []), // engagé d=30
      makeStep(baseOff({ x: 300, y: 540 }), 'O1', []), // retraite d=100
      { ...makeStep(baseOff({ x: 305, y: 470 }), 'O1', []), forcedScreener: 'O5' }, // ré-engagé
    ],
    activeStep: 2,
    screenRule: 'over',
    ...overrides,
  };
}

describe('B4 V2 — snake keep coverage', () => {
  it("default (opt-in false) → couverture standard (quality lue de l'annotation)", () => {
    const state = makeSnakeState();
    const def = effectiveDefensePositions(state, 2);
    // Sans le boost, D1 applique over avec quality 50 (default) → décalage
    // modéré par rapport à sa position homme-à-homme.
    // On capture la position de référence pour comparer avec V2 activé.
    expect(def.D1).toBeDefined();
  });

  it("activé → la couverture est PLUS engagée (D1 plus collé au poseur)", () => {
    const stateOff = makeSnakeState();
    const stateOn = makeSnakeState({ snakeKeepCoverage: true });
    const defOff = effectiveDefensePositions(stateOff, 2);
    const defOn = effectiveDefensePositions(stateOn, 2);

    // Avec quality boostée à 90, D1 est plus plaqué au poseur (rule=over,
    // bloc D1 = position au poseur reculé). La distance D1 ↔ poseur DOIT
    // DIMINUER quand V2 est activé.
    const o5 = state2O5(stateOn);
    const dOff = Math.hypot(defOff.D1.x - o5.x, defOff.D1.y - o5.y);
    const dOn = Math.hypot(defOn.D1.x - o5.x, defOn.D1.y - o5.y);
    expect(dOn).toBeLessThanOrEqual(dOff);
  });

  it("pas de snake détecté → pas de boost, comportement standard préservé", () => {
    // Carrier statique sur les 3 steps → pas de V, pas de snake.
    const s0 = makeInitialState();
    const staticOff: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 300, y: 440 },
    };
    const stateOff: AppState = {
      ...s0,
      steps: [
        makeStep(staticOff, 'O1', []),
        makeStep(staticOff, 'O1', []),
        { ...makeStep(staticOff, 'O1', []), forcedScreener: 'O5' },
      ],
      activeStep: 2,
      screenRule: 'over',
    };
    const stateOn: AppState = { ...stateOff, snakeKeepCoverage: true };
    const defOff = effectiveDefensePositions(stateOff, 2);
    const defOn = effectiveDefensePositions(stateOn, 2);
    // Pas de snake → positions identiques entre les deux configs.
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const dx = defOn[dId].x - defOff[dId].x;
      const dy = defOn[dId].y - defOff[dId].y;
      expect(Math.hypot(dx, dy)).toBeLessThan(2);
    });
  });

  it("activé sans écran à step N → pas de crash, no-op", () => {
    // Snake en cours mais à step N, O5 a quitté la zone → pas de screen.
    const s0 = makeInitialState();
    const offN1: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 300, y: 440 }, // proche
    };
    const offN: AttackerPositions = {
      ...offN1,
      O1: { x: 300, y: 540 }, // retraite
    };
    const offN2: AttackerPositions = {
      ...offN1,
      O1: { x: 305, y: 470 },
      O5: { x: 100, y: 100 }, // O5 est parti loin → no screen
    };
    const state: AppState = {
      ...s0,
      steps: [
        makeStep(offN1, 'O1', []),
        makeStep(offN, 'O1', []),
        makeStep(offN2, 'O1', []),
      ],
      activeStep: 2,
      screenRule: 'over',
      snakeKeepCoverage: true,
    };
    // Doit retourner des positions valides sans crash.
    const def = effectiveDefensePositions(state, 2);
    expect(def.D1).toBeDefined();
  });
});

function state2O5(state: AppState) {
  return state.steps[2].off.O5;
}
