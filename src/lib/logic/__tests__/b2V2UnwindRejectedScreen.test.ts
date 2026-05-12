// Tests B2 V2 — unwind reject screen (la défense relâche la couverture
// sur-anticipée quand un reject SHARP est détecté).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un AppState 2-step où :
 *  - N-1 : O5 collé à D1, O1 amorce un drive
 *  - N   : O1 vire opposé (drive côté droit, O5 reste à gauche)
 *  C'est un reject SHARP : awayness ≈ -1 (drive plein opposé). */
function makeRejectState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  // N-1 : O5 côté gauche d'O1, posant un écran sur D1.
  const offN1: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 260, y: 410 }, // écran côté gauche
  };
  // N : O1 drive plein DROIT (opposé du poseur)
  const offN: AttackerPositions = { ...offN1, O1: { x: 370, y: 480 } };
  return {
    ...s0,
    steps: [
      makeStep(offN1, 'O1', []),
      // Le step N peut avoir un forcedScreener pour s'assurer que le
      // detectScreen y trouve TOUJOURS un écran (sinon le reject est
      // trivial : pas de screen à unwind).
      { ...makeStep(offN, 'O1', []), forcedScreener: 'O5' },
    ],
    activeStep: 1,
    screenRule: 'hedge', // couverture agressive sur l'écran (D5 sort)
    ...overrides,
  };
}

describe('B2 V2 — unwind rejected screen', () => {
  it("par défaut (opt-in faux) → la défense applique hedge sur écran (sur-anticipée)", () => {
    const state = makeRejectState(); // unwindRejectedScreens non défini
    const def = effectiveDefensePositions(state, 1);
    // D5 a été sorti devant pour hedge → il n'est PAS sur sa position
    // naturelle (qui serait collé à O5).
    const o5 = state.steps[1].off.O5;
    const distD5toO5 = Math.hypot(def.D5.x - o5.x, def.D5.y - o5.y);
    // En hedge, D5 sort de O5 vers le porteur. La distance dépend de la
    // quality détectée + aggression default ; on attend ≥ 35px.
    expect(distD5toO5).toBeGreaterThan(35);
  });

  it("activé → la défense traite le reject : D5 retombe sur O5 (natural)", () => {
    const state = makeRejectState({ unwindRejectedScreens: true });
    const def = effectiveDefensePositions(state, 1);
    // L'écran est annulé pour ce step → D5 défend O5 normalement,
    // distance ≈ defenseDistance (40px) sur la ligne O5↔hoop.
    const o5 = state.steps[1].off.O5;
    const distD5toO5 = Math.hypot(def.D5.x - o5.x, def.D5.y - o5.y);
    // Devrait être < 50px (proche du natural defenseDistance).
    expect(distD5toO5).toBeLessThan(50);
  });

  it("activé sur step 0 → pas de prev step, pas d'unwind", () => {
    const state = makeRejectState({ unwindRejectedScreens: true });
    state.activeStep = 0;
    const def = effectiveDefensePositions(state, 0);
    // Step 0 n'a pas de prevOff → pas de détection reject possible.
    // La défense suit son comportement normal. On vérifie juste que ça
    // ne crash pas et retourne quelque chose.
    expect(def.D1).toBeDefined();
    expect(def.D5).toBeDefined();
  });

  it("activé sans reject (carrier approche poseur) → comportement standard préservé", () => {
    const s0 = makeInitialState();
    // N-1 et N : O1 approche O5 (au lieu de fuir)
    const offN1: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 260, y: 410 },
    };
    const offN: AttackerPositions = { ...offN1, O1: { x: 280, y: 440 } }; // approche
    const state: AppState = {
      ...s0,
      steps: [
        makeStep(offN1, 'O1', []),
        { ...makeStep(offN, 'O1', []), forcedScreener: 'O5' },
      ],
      activeStep: 1,
      screenRule: 'hedge',
      unwindRejectedScreens: true,
    };
    const def = effectiveDefensePositions(state, 1);
    // Pas de reject (carrier vient vers l'écran), donc l'écran s'applique
    // normalement → D5 sorti devant le porteur (hedge actif).
    const o5 = offN.O5;
    const distD5toO5 = Math.hypot(def.D5.x - o5.x, def.D5.y - o5.y);
    expect(distD5toO5).toBeGreaterThan(25); // D5 a quitté O5 pour hedge
  });
});
