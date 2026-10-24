import { describe, expect, it } from 'vitest';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import type { Annotation, AppState, AttackerPositions, Step } from '@/lib/types';
import {
  moveStep,
  normalizeArrivalMovements,
  rederiveAnnotationEndpoints,
} from '../stepOrderTransforms';

function offWith(partial: Partial<AttackerPositions>): AttackerPositions {
  return { ...makeInitialState().steps[0].off, ...partial };
}

function makeSteps(): Step[] {
  return [
    makeStep(offWith({ O1: { x: 100, y: 100 }, O2: { x: 100, y: 300 } }), 'O1', []),
    makeStep(offWith({ O1: { x: 200, y: 100 }, O2: { x: 200, y: 300 } }), 'O1', []),
    makeStep(offWith({ O1: { x: 300, y: 100 }, O2: { x: 300, y: 300 } }), 'O2', []),
  ];
}

function stateWith(steps: Step[]): AppState {
  return { ...makeInitialState(), steps, activeStep: 0 };
}

describe('moveStep — réorganisation', () => {
  it('déplace l’étape et suit l’étape active', () => {
    const s = stateWith(makeSteps());
    s.steps[0].label = 'A';
    s.steps[1].label = 'B';
    s.steps[2].label = 'C';

    const next = moveStep(s, 2, 0);
    expect(next.steps.map((st) => st.label)).toEqual(['C', 'A', 'B']);
    expect(next.activeStep).toBe(0);
  });

  it('recalcule la destination d’une course selon la nouvelle séquence', () => {
    const s = stateWith(makeSteps());
    const cut: Annotation = {
      type: 'cut',
      fromId: 'O1',
      from: { x: 100, y: 100 },
      to: { x: 200, y: 100 },
    };
    s.steps[0].annotations = [cut];

    // [s0, s1, s2] → [s1, s0, s2] : la course de s0 finit désormais sur s2.
    const next = moveStep(s, 0, 1);
    const moved = next.steps[1].annotations[0];
    expect(moved.from).toEqual({ x: 100, y: 100 });
    expect(moved.to).toEqual({ x: 300, y: 100 });
    // Les waypoints seraient conservés (aucun ici).
    expect(next.activeStep).toBe(1);
  });

  it('recalcule une passe depuis le nouveau porteur précédent', () => {
    const s = stateWith(makeSteps());
    s.steps[1].annotations = [
      {
        type: 'pass',
        fromId: 'O1',
        toId: 'O2',
        from: { x: 100, y: 100 },
        to: { x: 200, y: 300 },
      },
    ];

    // [s0, s1, s2] → [s0, s2, s1] : la passe de s1 part maintenant de s2.
    const next = moveStep(s, 2, 1);
    const pass = next.steps[2].annotations[0];
    expect(pass.from).toEqual({ x: 300, y: 100 });
    expect(pass.to).toEqual({ x: 200, y: 300 });
  });

  it('refuse une séquence contenant des étapes interpolées', () => {
    const s = stateWith(makeSteps());
    s.steps[1] = { ...s.steps[1], isInterpolated: true };
    expect(moveStep(s, 0, 2)).toBe(s);
  });

  it('no-op sur des index invalides ou identiques', () => {
    const s = stateWith(makeSteps());
    expect(moveStep(s, 0, 0)).toBe(s);
    expect(moveStep(s, -1, 1)).toBe(s);
    expect(moveStep(s, 0, 3)).toBe(s);
  });
});

describe('normalizeArrivalMovements', () => {
  it('remonte un déplacement décrit sur son étape d’arrivée', () => {
    const steps = makeSteps();
    steps[1].annotations = [
      { type: 'cut', fromId: 'O1', from: { x: 100, y: 100 }, to: { x: 200, y: 100 } },
    ];
    const out = normalizeArrivalMovements(steps);
    expect(out[0].annotations).toHaveLength(1);
    expect(out[1].annotations).toHaveLength(0);
    expect(out[0].annotations[0].to).toEqual({ x: 200, y: 100 });
  });

  it('jette le doublon d’arrivée si le départ décrit déjà le joueur', () => {
    const steps = makeSteps();
    steps[0].annotations = [
      { type: 'cut', fromId: 'O1', from: { x: 100, y: 100 }, to: { x: 200, y: 100 } },
    ];
    steps[1].annotations = [
      { type: 'cut', fromId: 'O1', from: { x: 100, y: 100 }, to: { x: 200, y: 100 } },
    ];
    const out = normalizeArrivalMovements(steps);
    expect(out[0].annotations).toHaveLength(1);
    expect(out[1].annotations).toHaveLength(0);
  });
});

describe('rederiveAnnotationEndpoints', () => {
  it('laisse une action pendante de la dernière étape inchangée', () => {
    const steps = makeSteps();
    const dangling: Annotation = {
      type: 'screen',
      fromId: 'O2',
      from: { x: 100, y: 300 },
      to: { x: 120, y: 300 },
    };
    steps[2].annotations = [dangling];
    const out = rederiveAnnotationEndpoints(steps);
    expect(out[2].annotations[0]).toEqual(dangling);
  });
});
