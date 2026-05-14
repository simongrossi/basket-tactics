import { describe, expect, it } from 'vitest';
import {
  resolveScreenContactState,
  screenContactPhase,
} from '../screenPhysics';

describe('screen state machine', () => {
  it('déroule arriving en approach -> impact -> stuck -> navigate', () => {
    expect(resolveScreenContactState({ mode: 'arriving', localT: 0.05, quality: 80 }).state)
      .toBe('approach');
    expect(resolveScreenContactState({ mode: 'arriving', localT: 0.18, quality: 80 }).state)
      .toBe('impact');
    expect(resolveScreenContactState({ mode: 'arriving', localT: 0.50, quality: 80 }).state)
      .toBe('stuck');
    expect(resolveScreenContactState({ mode: 'arriving', localT: 0.96, quality: 80 }).state)
      .toBe('navigate');
  });

  it('déroule leaving en stuck -> navigate -> recover', () => {
    expect(resolveScreenContactState({ mode: 'leaving', localT: 0.20, quality: 100 }).state)
      .toBe('stuck');
    expect(resolveScreenContactState({ mode: 'leaving', localT: 0.90, quality: 40 }).state)
      .toBe('navigate');
    expect(resolveScreenContactState({ mode: 'leaving', localT: 0.98, quality: 100 }).state)
      .toBe('recover');
  });

  it('expose released uniquement après un contact récent sans mode actif', () => {
    expect(resolveScreenContactState({
      mode: null,
      localT: 0.1,
      quality: 50,
      hadRecentContact: true,
    })).toMatchObject({
      state: 'released',
      visualPhase: 'released',
      contactActive: false,
      released: true,
    });

    expect(resolveScreenContactState({ mode: null, localT: 0.1, quality: 50 }).state)
      .toBeUndefined();
  });

  it('garde screenContactPhase rétrocompatible pour les appels existants', () => {
    expect(screenContactPhase(null, 0.5, 50)).toBeUndefined();
    expect(screenContactPhase('stuck', 0.1, 50)).toBe('impact');
  });
});
