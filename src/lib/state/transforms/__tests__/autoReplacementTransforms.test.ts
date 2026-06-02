import { describe, it, expect } from 'vitest';
import { setAutoReplacement } from '@/lib/state/transforms/scenarioTransforms';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function base(): AppState {
  return { ...makeInitialState(), scriptedActions: [] };
}

describe('setAutoReplacement', () => {
  it('active + pose la profondeur', () => {
    const s = setAutoReplacement(base(), true, 3);
    expect(s.autoReplacementEnabled).toBe(true);
    expect(s.autoReplacementDepth).toBe(3);
  });
  it('désactive', () => {
    const s = setAutoReplacement({ ...base(), autoReplacementEnabled: true }, false, 2);
    expect(s.autoReplacementEnabled).toBe(false);
  });
  it('clampe la profondeur (99 → 4)', () => {
    expect(setAutoReplacement(base(), true, 99).autoReplacementDepth).toBe(4);
  });
});
