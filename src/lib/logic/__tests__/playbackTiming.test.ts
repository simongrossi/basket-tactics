import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { fullStepToSeconds, secondsToFullStep, totalDurationSeconds } from '../timecode';
import { playbackTickAtElapsed } from '../playbackClock';

function scenario() {
  const state = makeInitialState();
  const step = state.steps[0];
  return { ...state, steps: [
    { ...step, duration: 1 }, { ...step, isInterpolated: true },
    { ...step, duration: 3 }, { ...step },
  ] };
}

describe('horloge commune de lecture et export', () => {
  it('respecte les durées différentes et ne compte pas deux fois les interpolations', () => {
    const state = scenario();
    expect(totalDurationSeconds(state)).toBe(4);
    expect(secondsToFullStep(state, 0.5)).toBe(1);
    expect(secondsToFullStep(state, 1)).toBe(2);
    expect(secondsToFullStep(state, 2.5)).toBe(2.5);
    for (const t of [0, 0.4, 1, 1.8, 2, 2.3, 3]) {
      expect(secondsToFullStep(state, fullStepToSeconds(state, t))).toBeCloseTo(t, 10);
    }
  });

  it('reprend depuis une pause et termine exactement à la fin', () => {
    const state = scenario();
    const base = { state, speed: 0.5, totalSteps: 3, startT: 2 };
    expect(playbackTickAtElapsed({ ...base, elapsedMs: 0 })).toEqual({ t: 2, ended: false });
    expect(playbackTickAtElapsed({ ...base, elapsedMs: 3000 })).toEqual({ t: 2.5, ended: false });
    expect(playbackTickAtElapsed({ ...base, elapsedMs: 6000 })).toEqual({ t: 3, ended: true });
  });

  it('la lecture à 1× rejoint chaque instant échantillonné par l’export', () => {
    const state = scenario();
    for (let frame = 0; frame < 120; frame++) {
      const seconds = frame / 30;
      const played = playbackTickAtElapsed({ state, speed: 1, totalSteps: 3, startT: 0, elapsedMs: seconds * 1000 });
      expect(played.t).toBeCloseTo(secondsToFullStep(state, seconds), 10);
    }
  });

  it('utilise les durées par défaut, y compris le mode vitesse réelle', () => {
    const state = makeInitialState();
    state.steps = [state.steps[0], structuredClone(state.steps[0])];
    expect(fullStepToSeconds(state, 1)).toBe(4);
    expect(fullStepToSeconds({ ...state, realSpeedMode: true }, 1)).toBe(0.5);
    expect(fullStepToSeconds({ ...state, secondsPerStep: 2 }, 1)).toBe(2);
    expect(secondsToFullStep(state, -1)).toBe(0);
    expect(secondsToFullStep(state, 100)).toBe(1);
    expect(secondsToFullStep({ ...state, steps: [] }, 1)).toBe(0);
  });
});
