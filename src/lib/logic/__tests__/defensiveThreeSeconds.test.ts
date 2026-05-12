// Tests B7 — defensive 3 seconds (règle FIBA).

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { computeCoachDiagnostics } from '../coachDiagnostics';

/** Construit un AppState avec 3 steps consécutifs où D5 est camped dans la
 *  raquette sans attaquant proche (≤ 50 px). Le reste de l'offense est parqué
 *  hors de la raquette pour ne pas neutraliser la violation. */
function makeThreeSecState(): AppState {
  const s0 = makeInitialState();
  // Position du paint center ≈ (300, 130) dans le repère hoop top.
  // On force D5 à y rester pendant 3 steps via defenseOverrides.
  const paintPos = { x: 300, y: 150 };
  const farOff = {
    O1: { x: 50, y: 500 },
    O2: { x: 100, y: 500 },
    O3: { x: 500, y: 500 },
    O4: { x: 550, y: 500 },
    O5: { x: 600, y: 550 },
  };

  const stepBase = {
    ...s0.steps[0],
    off: farOff,
    ballCarrier: 'O1' as const,
    // D5 override = paint position (force le camping)
    defenseOverrides: { D5: paintPos } as const,
  };

  return {
    ...s0,
    steps: [stepBase, makeStep(farOff, 'O1', []), makeStep(farOff, 'O1', [])].map((st, i) => ({
      ...st,
      ...(i === 0 ? {} : { defenseOverrides: { D5: paintPos } }),
    })),
    activeStep: 2,
  };
}

describe('defensiveThreeSecondsRule (B7)', () => {
  it("aucune violation à step 0 ou 1 (pas assez d'historique)", () => {
    const state = makeThreeSecState();
    state.activeStep = 0;
    const diags = computeCoachDiagnostics(state, 0);
    expect(diags.some((d) => d.tag === 'defensive-3sec')).toBe(false);

    state.activeStep = 1;
    const diags1 = computeCoachDiagnostics(state, 1);
    expect(diags1.some((d) => d.tag === 'defensive-3sec')).toBe(false);
  });

  it('violation au step 2 si D5 camped 3 steps dans la raquette sans attaquant proche', () => {
    const state = makeThreeSecState();
    const diags = computeCoachDiagnostics(state, 2);
    const violation = diags.find((d) => d.tag === 'defensive-3sec');
    expect(violation).toBeDefined();
    expect(violation!.defenders).toContain('D5');
  });

  it('PAS de violation si un attaquant est proche du défenseur', () => {
    const state = makeThreeSecState();
    // Place O5 collé sur D5 (à ~10 px) → D5 marque vraiment quelqu'un.
    state.steps = state.steps.map((st) => ({
      ...st,
      off: { ...st.off, O5: { x: 305, y: 155 } },
    }));
    const diags = computeCoachDiagnostics(state, 2);
    expect(diags.some((d) => d.tag === 'defensive-3sec')).toBe(false);
  });

  it('PAS de violation si D5 sort de la raquette à un step intermédiaire', () => {
    const state = makeThreeSecState();
    // À step 1, sortir D5 de la raquette.
    state.steps = state.steps.map((st, i) =>
      i === 1
        ? { ...st, defenseOverrides: { D5: { x: 100, y: 300 } } } // hors paint
        : st
    );
    const diags = computeCoachDiagnostics(state, 2);
    expect(diags.some((d) => d.tag === 'defensive-3sec')).toBe(false);
  });
});
