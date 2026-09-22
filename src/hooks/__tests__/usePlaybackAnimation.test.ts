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

it.each([0.5, 0.25])('redémarre une animation importée à t=%s pendant la lecture, sans conserver l’ancienne boucle', (importedStartT) => {
  vi.useFakeTimers();
  const originalState = makeInitialState();
  originalState.steps = [{ ...originalState.steps[0], duration: 1 }, structuredClone(originalState.steps[0])];
  const originalTick = vi.fn();
  const originalEnd = vi.fn();
  const initialProps = {
    state: originalState, totalSteps: 1, isPlaying: true,
    startT: 0.5, speed: 1, runId: 1, onTick: originalTick, onEnd: originalEnd,
  };
  const { rerender } = renderHook((options) => usePlaybackAnimation(options), { initialProps });
  act(() => vi.advanceTimersByTime(330));
  expect(originalTick.mock.lastCall![0]).toBeCloseTo(0.83, 6);

  const importedState = makeInitialState();
  importedState.steps = [
    { ...importedState.steps[0], duration: 4 },
    { ...structuredClone(importedState.steps[0]), duration: 8 },
    structuredClone(importedState.steps[0]),
  ];
  const importedTick = vi.fn();
  const importedEnd = vi.fn();
  const originalTickCount = originalTick.mock.calls.length;
  rerender({
    state: importedState, totalSteps: 2, isPlaying: true,
    startT: importedStartT, speed: 2, runId: 2, onTick: importedTick, onEnd: importedEnd,
  });
  expect(importedTick).toHaveBeenCalledExactlyOnceWith(importedStartT);
  // L'ancienne animation serait terminée ici. La nouvelle respecte sa durée
  // de 4s et sa vitesse 2×, avec une seule boucle de 10 ticks en 330ms.
  act(() => vi.advanceTimersByTime(330));
  expect(importedTick).toHaveBeenCalledTimes(11);
  expect(importedTick.mock.lastCall![0]).toBeCloseTo(importedStartT + 0.165, 6);
  expect(originalTick).toHaveBeenCalledTimes(originalTickCount);
  expect(originalEnd).not.toHaveBeenCalled();
  expect(importedEnd).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(1_980));
  // La deuxième transition dure 8s, indépendamment des 4s de la première.
  expect(importedTick.mock.lastCall![0]).toBeCloseTo(1 + (importedStartT * 4 + 4.62 - 4) / 8, 6);
  expect(importedEnd).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(10_000));
  expect(importedTick.mock.lastCall![0]).toBe(2);
  expect(importedEnd).toHaveBeenCalledTimes(1);
  const completedTickCount = importedTick.mock.calls.length;
  act(() => vi.advanceTimersByTime(1_000));
  expect(importedTick).toHaveBeenCalledTimes(completedTickCount);
  expect(importedEnd).toHaveBeenCalledTimes(1);
  expect(originalEnd).not.toHaveBeenCalled();
});
