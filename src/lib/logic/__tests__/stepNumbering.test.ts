import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, Annotation } from '@/lib/types';
import { addAnnotation } from '@/lib/state/transforms/annotationTransforms';
import { addStep, setActiveStep } from '@/lib/state/transforms/stepTransforms';
import { formatStepCounter, getVisibleStepRows, stepCounterAt } from '../stepNumbering';

function cut(state: AppState, id: 'O2' | 'O3', to: { x: number; y: number }): Annotation {
  return { type: 'cut', fromId: id, toId: null, from: { ...state.steps[state.activeStep].off[id] }, to };
}

const label = (s: AppState, t: number) => formatStepCounter(stepCounterAt(s.steps, t));

describe('stepNumbering', () => {
  it('système vierge : placement de départ, aucune étape', () => {
    const s = makeInitialState();
    expect(getVisibleStepRows(s.steps)).toHaveLength(0);
    expect(label(s, 0)).toBe('Placement de départ');
  });

  it('une course : 1 étape numérotée, puis position finale', () => {
    const s0 = makeInitialState();
    const s = addAnnotation(s0, cut(s0, 'O2', { x: 200, y: 100 }));
    expect(s.steps).toHaveLength(2);
    expect(getVisibleStepRows(s.steps)).toHaveLength(1);
    expect(label(s, 0)).toBe('Étape 1 / 1');
    expect(label(s, 0.5)).toBe('Étape 1 / 1');
    expect(label(s, 1)).toBe('Position finale');
  });

  it('course puis course : 2 étapes, même total partout sur la timeline', () => {
    const s0 = makeInitialState();
    const a = addAnnotation(s0, cut(s0, 'O2', { x: 200, y: 100 }));
    const b = addStep(a); // se place sur la position finale
    const s = addAnnotation(b, cut(b, 'O3', { x: 300, y: 100 }));
    expect(getVisibleStepRows(s.steps).map((r) => r.number)).toEqual([1, 2]);
    expect(label(s, 0)).toBe('Étape 1 / 2');
    expect(label(s, 1)).toBe('Étape 2 / 2');
    expect(label(s, 1.7)).toBe('Étape 2 / 2');
    expect(label(s, 2)).toBe('Position finale');
  });

  it('« + étape » depuis la position finale : compteur sur la position finale', () => {
    const s0 = makeInitialState();
    const a = addAnnotation(s0, cut(s0, 'O2', { x: 200, y: 100 }));
    const s = addStep(a);
    expect(stepCounterAt(s.steps, s.activeStep).kind).toBe('end');
    expect(label(setActiveStep(s, 0), 0)).toBe('Étape 1 / 1');
  });

  it('étapes interpolées rattachées à l\'étape en cours', () => {
    const s0 = makeInitialState();
    const a = addAnnotation(s0, cut(s0, 'O2', { x: 200, y: 100 }));
    const steps = [a.steps[0], { ...a.steps[0], annotations: [], isInterpolated: true }, a.steps[1]];
    expect(formatStepCounter(stepCounterAt(steps, 1))).toBe('Étape 1 / 1');
    expect(formatStepCounter(stepCounterAt(steps, 2))).toBe('Position finale');
  });
});
