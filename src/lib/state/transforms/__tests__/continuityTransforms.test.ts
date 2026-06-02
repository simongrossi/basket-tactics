import { describe, it, expect } from 'vitest';
import { setContinuityLoop } from '@/lib/state/transforms/scenarioTransforms';
import type { AppState, ContinuityLoop } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function base(): AppState {
  return { ...makeInitialState(), scriptedActions: [] };
}

const loop: ContinuityLoop = {
  startActionId: 'b1', endActionId: 'b2',
  rotation: ['O1', 'O2', 'O3', 'O4', 'O5'], maxCycles: 3,
};

describe('setContinuityLoop', () => {
  it('pose la boucle', () => {
    const s = setContinuityLoop(base(), loop);
    expect(s.continuityLoop).toEqual(loop);
  });

  it('null efface la boucle', () => {
    const s = setContinuityLoop({ ...base(), continuityLoop: loop }, null);
    expect(s.continuityLoop).toBeUndefined();
  });
});
