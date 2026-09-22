import { describe, it, expect } from 'vitest';
import type { Step } from '../../../types';
import {
  realStepIndices,
  nextRealStepIndex,
  prevRealStepIndex,
  isOnFirstRealStep,
  isOnLastRealStep,
} from '../realSteps';

/** Construit une liste de steps : `r` = réelle, `i` = interpolée. */
function makeSteps(pattern: ('r' | 'i')[]): Step[] {
  return pattern.map((p) => ({
    off: {} as Step['off'],
    ballCarrier: 'O1',
    annotations: [],
    ...(p === 'i' ? { isInterpolated: true } : {}),
  })) as Step[];
}

// Pattern type : R0 i i R3 i R5  → réelles aux indices 0, 3, 5
const mixed = makeSteps(['r', 'i', 'i', 'r', 'i', 'r']);

describe('realStepIndices', () => {
  it('liste les indices des étapes réelles', () => {
    expect(realStepIndices(mixed)).toEqual([0, 3, 5]);
  });
  it('toutes réelles → tous les indices', () => {
    expect(realStepIndices(makeSteps(['r', 'r', 'r']))).toEqual([0, 1, 2]);
  });
  it('liste vide → []', () => {
    expect(realStepIndices([])).toEqual([]);
  });
});

describe('nextRealStepIndex', () => {
  it('saute les interpolées vers la réelle suivante', () => {
    expect(nextRealStepIndex(mixed, 0)).toBe(3);
    expect(nextRealStepIndex(mixed, 1)).toBe(3);
    expect(nextRealStepIndex(mixed, 3)).toBe(5);
  });
  it('clamp sur la dernière réelle (pas de wrap)', () => {
    expect(nextRealStepIndex(mixed, 5)).toBe(5);
    expect(nextRealStepIndex(mixed, 4)).toBe(5);
  });
});

describe('prevRealStepIndex', () => {
  it('saute les interpolées vers la réelle précédente', () => {
    expect(prevRealStepIndex(mixed, 5)).toBe(3);
    expect(prevRealStepIndex(mixed, 4)).toBe(3);
    expect(prevRealStepIndex(mixed, 3)).toBe(0);
  });
  it('clamp sur la première réelle (pas de wrap)', () => {
    expect(prevRealStepIndex(mixed, 0)).toBe(0);
    expect(prevRealStepIndex(mixed, 1)).toBe(0);
  });
});

describe('isOnFirstRealStep / isOnLastRealStep', () => {
  it('bornes correctes', () => {
    expect(isOnFirstRealStep(mixed, 0)).toBe(true);
    expect(isOnFirstRealStep(mixed, 3)).toBe(false);
    expect(isOnLastRealStep(mixed, 5)).toBe(true);
    expect(isOnLastRealStep(mixed, 3)).toBe(false);
  });
  it('étape interpolée avant la 1ère réelle compte comme first', () => {
    const s = makeSteps(['i', 'r', 'r']); // réelles à 1, 2
    expect(isOnFirstRealStep(s, 0)).toBe(true);
  });
  it('liste vide → true des deux côtés', () => {
    expect(isOnFirstRealStep([], 0)).toBe(true);
    expect(isOnLastRealStep([], 0)).toBe(true);
  });
});
