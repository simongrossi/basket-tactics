// Tests B.4 UI — transform setAnnotationTimingAbs.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { setAnnotationTimingAbs } from '@/lib/state/transforms/annotationTransforms';

const POS: AttackerPositions = {
  O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
  O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
};

function makeState(): AppState {
  const base = makeInitialState();
  return {
    ...base,
    steps: [
      {
        off: POS, ballCarrier: 'O1',
        annotations: [
          { type: 'dribble', fromId: 'O1', from: POS.O1, to: POS.O1, tStart: 0, tEnd: 1 },
          { type: 'pass', fromId: 'O1', toId: 'O2', from: POS.O1, to: POS.O2 },
        ],
      },
      { off: POS, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
  };
}

describe('setAnnotationTimingAbs (B.4)', () => {
  it('définit tStartAbs et tEndAbs sur une annotation de mouvement', () => {
    const s = makeState();
    const next = setAnnotationTimingAbs(s, 0, 0, 0.5, 1.5);
    const ann = next.steps[0].annotations[0];
    expect(ann.tStartAbs).toBe(0.5);
    expect(ann.tEndAbs).toBe(1.5);
    // tStart/tEnd legacy non touchés (le moteur prend abs en priorité via
    // resolveAnnotationTiming).
    expect(ann.tStart).toBe(0);
    expect(ann.tEnd).toBe(1);
  });

  it('undefined efface la borne', () => {
    const s = setAnnotationTimingAbs(makeState(), 0, 0, 0.5, 1.5);
    const cleared = setAnnotationTimingAbs(s, 0, 0, undefined, undefined);
    expect(cleared.steps[0].annotations[0].tStartAbs).toBeUndefined();
    expect(cleared.steps[0].annotations[0].tEndAbs).toBeUndefined();
  });

  it('rejette les annotations non-mouvement (pass)', () => {
    const s = makeState();
    const next = setAnnotationTimingAbs(s, 0, 1, 0.5, 1.5); // annoIdx=1 = pass
    // Annotation pass inchangée.
    const ann = next.steps[0].annotations[1];
    expect(ann.tStartAbs).toBeUndefined();
    expect(ann.tEndAbs).toBeUndefined();
  });

  it('stepIdx ou annoIdx invalide → state inchangé', () => {
    const s = makeState();
    expect(setAnnotationTimingAbs(s, 99, 0, 0.5, 1.5)).toBe(s);
    expect(setAnnotationTimingAbs(s, 0, 99, 0.5, 1.5)).toBe(s);
  });
});
