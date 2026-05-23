import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  addAnnotation,
  addFeinte,
  removeFeinte,
  updateFeinte,
} from '../annotationTransforms';

function stateWithCut() {
  const s = makeInitialState();
  return addAnnotation(s, {
    type: 'cut',
    fromId: 'O1',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
  });
}

describe('feintes transforms', () => {
  it('addFeinte initialise feintes à [t] si absent', () => {
    const s = stateWithCut();
    const out = addFeinte(s, s.activeStep, 0, 0.5);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0.5]);
    // entrée non mutée
    expect(s.steps[s.activeStep].annotations[0].feintes).toBeUndefined();
  });

  it('addFeinte clampe t à [0, 1]', () => {
    const s = stateWithCut();
    let out = addFeinte(s, s.activeStep, 0, -0.5);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0]);
    out = addFeinte(out, s.activeStep, 0, 1.5);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0, 1]);
  });

  it('updateFeinte change la position sans toucher les autres', () => {
    let s = stateWithCut();
    s = addFeinte(s, s.activeStep, 0, 0.3);
    s = addFeinte(s, s.activeStep, 0, 0.7);
    const out = updateFeinte(s, s.activeStep, 0, 0, 0.4);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0.4, 0.7]);
  });

  it('removeFeinte retire l\'index donné', () => {
    let s = stateWithCut();
    s = addFeinte(s, s.activeStep, 0, 0.2);
    s = addFeinte(s, s.activeStep, 0, 0.5);
    s = addFeinte(s, s.activeStep, 0, 0.8);
    const out = removeFeinte(s, s.activeStep, 0, 1);
    expect(out.steps[s.activeStep].annotations[0].feintes).toEqual([0.2, 0.8]);
  });

  it('annotation index invalide → no-op', () => {
    const s = stateWithCut();
    expect(addFeinte(s, s.activeStep, 99, 0.5)).toBe(s);
    expect(updateFeinte(s, s.activeStep, 99, 0, 0.5)).toBe(s);
    expect(removeFeinte(s, s.activeStep, 99, 0)).toBe(s);
  });
});
