// Tests B9 — chaîne d'écrans sur un cutter.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { countCutterScreenChain, cuttersInScreenChain } from '../screens';

/** Helper : construit un AppState avec N steps consécutifs où O3 (cutter)
 *  utilise un pindown posé par O5. Pour que `detectOffBallScreens` retourne
 *  un résultat à chaque step, on positionne O5 dans le rayon de détection
 *  de la position d'auto-couverture de D3 (entre O3 et le panier).
 *
 *  Calcul rapide :
 *    - O3 = (470, 380), HOOP = (300, 75) → vecteur unité ≈ (-0.49, -0.87)
 *    - D3 (auto) à `defenseDistance` = 40 px de O3 dans cette direction
 *      → D3 ≈ (450, 345)
 *    - O5 = (450, 340) est à ~5 px de D3 (< screenRadius=35) ET ~52 px
 *      de O3 (< 80) → écran détecté. */
function makeChainState(numSteps: number): AppState {
  const s0 = makeInitialState();
  const steps = [];
  for (let i = 0; i < numSteps; i++) {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 }, // porteur, hors du screen
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 }, // cutter
      O4: { x: 220, y: 230 },
      O5: { x: 440, y: 320 }, // poseur ≤ 35px de D3 (init ET auto)
    };
    steps.push(makeStep(off, 'O1', []));
  }
  return {
    ...s0,
    steps,
    activeStep: numSteps - 1,
  };
}

describe('countCutterScreenChain', () => {
  it('0 si pas de step (cutter never screened)', () => {
    const state = makeChainState(1);
    // Modifier pour que O5 soit loin → pas de screen détecté
    state.steps[0].off.O5 = { x: 50, y: 50 };
    expect(countCutterScreenChain(state, 0, 'O3', 3)).toBe(0);
  });

  it('1 si écran détecté seulement au step courant', () => {
    const state = makeChainState(1);
    const count = countCutterScreenChain(state, 0, 'O3', 3);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('compte ≥ 2 si même cutter sur 2 steps consécutifs', () => {
    const state = makeChainState(3);
    const count = countCutterScreenChain(state, 2, 'O3', 3);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("respecte la depth (ne remonte pas au-delà)", () => {
    const state = makeChainState(5);
    // depth=1 ne compte que le step courant
    const count = countCutterScreenChain(state, 4, 'O3', 1);
    expect(count).toBeLessThanOrEqual(1);
  });

  it('0 pour un cutter non impliqué (O2 ici)', () => {
    const state = makeChainState(3);
    expect(countCutterScreenChain(state, 2, 'O2', 3)).toBe(0);
  });
});

describe('cuttersInScreenChain', () => {
  it("identifie correctement les cutters qui dépassent le seuil", () => {
    const state = makeChainState(3);
    const chained = cuttersInScreenChain(state, 2, ['O2', 'O3', 'O4'], 3, 2);
    expect(chained.has('O3')).toBe(true);
    expect(chained.has('O2')).toBe(false);
    expect(chained.has('O4')).toBe(false);
  });

  it('Set vide si threshold trop haut', () => {
    const state = makeChainState(3);
    const chained = cuttersInScreenChain(state, 2, ['O3'], 3, 10);
    expect(chained.size).toBe(0);
  });
});
