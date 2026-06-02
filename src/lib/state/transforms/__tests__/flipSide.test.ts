import { describe, it, expect } from 'vitest';
import { setAnnotationFlipSide } from '../annotationTransforms';
import type { AppState, Annotation } from '@/lib/types';

function stateWithCut(): AppState {
  const cut: Annotation = {
    type: 'cut', fromId: 'O2', toId: null,
    from: { x: 0, y: 0 }, to: { x: 0, y: 100 },
  } as Annotation;
  return {
    steps: [{ off: {}, ballCarrier: 'O1', annotations: [cut] }],
  } as unknown as AppState;
}

describe('setAnnotationFlipSide', () => {
  it('pose le côté de flip', () => {
    const s = setAnnotationFlipSide(stateWithCut(), 0, 0, 'left');
    expect(s.steps[0].annotations[0].flipSideIfDefenderOn).toBe('left');
  });
  it('undefined efface le flip', () => {
    const s1 = setAnnotationFlipSide(stateWithCut(), 0, 0, 'right');
    const s2 = setAnnotationFlipSide(s1, 0, 0, undefined);
    expect(s2.steps[0].annotations[0].flipSideIfDefenderOn).toBeUndefined();
  });
  it('no-op si annotation absente', () => {
    const s = stateWithCut();
    expect(setAnnotationFlipSide(s, 9, 9, 'left')).toBe(s);
  });
});
