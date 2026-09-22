// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { usePlaybackAnimation } from '../usePlaybackAnimation';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('change la vitesse sans revenir au point de départ et reprend après pause', () => {
  vi.useFakeTimers();
  const state = makeInitialState();
  state.steps = [{ ...state.steps[0], duration: 4 }, structuredClone(state.steps[0])];
  const onTick = vi.fn();
  const onEnd = vi.fn();
  const { rerender } = renderHook(({ speed, isPlaying, startT }) => usePlaybackAnimation({
    state, totalSteps: 1, isPlaying, startT, speed, onTick, onEnd,
  }), { initialProps: { speed: 1, isPlaying: true, startT: 0 } });
  act(() => vi.advanceTimersByTime(990));
  expect(onTick.mock.lastCall![0]).toBeCloseTo(0.2475, 6);
  rerender({ speed: 2, isPlaying: true, startT: 0 });
  expect(onTick.mock.lastCall![0]).toBeCloseTo(0.2475, 6);
  act(() => vi.advanceTimersByTime(990));
  expect(onTick.mock.lastCall![0]).toBeCloseTo(0.7425, 6);
  const pausedT = onTick.mock.lastCall![0];
  rerender({ speed: 2, isPlaying: false, startT: pausedT });
  act(() => vi.advanceTimersByTime(1000));
  expect(onTick.mock.lastCall![0]).toBe(pausedT);
  rerender({ speed: 2, isPlaying: true, startT: pausedT });
  expect(onTick.mock.lastCall![0]).toBeCloseTo(pausedT, 6);
  act(() => vi.advanceTimersByTime(1000));
  expect(onTick.mock.lastCall![0]).toBe(1);
  expect(onEnd).toHaveBeenCalledTimes(1);
});
