// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppState } from '../useAppState';

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('defender pursuit lifecycle', () => {
  it('starts from the supplied displayed positions even with optional drag inertia disabled', () => {
    const { result } = renderHook(() => useAppState());
    expect(result.current.state.defenderDragInertiaEnabled).toBe(false);
    const displayed = { D5: { x: 180, y: 250 } };
    act(() => result.current.beginDefenderPursuit(displayed));
    expect(result.current.defenderPursuit?.active).toBe(true);
    expect(result.current.defenderPursuit?.stepIndex).toBe(result.current.state.activeStep);
    expect(result.current.defenderPursuit?.snapshot.D5).toEqual(displayed.D5);
  });

  it('retains a released pursuit and cannot erase a newer drag with a stale release timer', () => {
    const { result } = renderHook(() => useAppState());
    act(() => result.current.beginDefenderPursuit({ D5: { x: 100, y: 200 } }));
    const firstSnapshot = result.current.defenderPursuit?.snapshot;
    act(() => result.current.endDefenderPursuit());
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.defenderPursuit?.active).toBe(false);
    expect(result.current.defenderPursuit?.snapshot).toBe(firstSnapshot);

    act(() => result.current.beginDefenderPursuit({ D5: { x: 150, y: 200 } }));
    act(() => result.current.endDefenderPursuit());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.beginDefenderPursuit({ D5: { x: 160, y: 200 } }));
    const newestPursuit = result.current.defenderPursuit;
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.defenderPursuit).toBe(newestPursuit);
    expect(result.current.defenderPursuit?.active).toBe(true);
  });

  it('only clears the exact released pursuit that has finished catching up', () => {
    const { result } = renderHook(() => useAppState());
    act(() => result.current.beginDefenderPursuit({ D5: { x: 100, y: 200 } }));
    act(() => result.current.endDefenderPursuit());
    const olderReleased = result.current.defenderPursuit!;

    act(() => result.current.beginDefenderPursuit({ D5: { x: 160, y: 200 } }));
    const newerActive = result.current.defenderPursuit!;
    act(() => result.current.finishDefenderPursuit(olderReleased));
    expect(result.current.defenderPursuit).toBe(newerActive);
    act(() => result.current.finishDefenderPursuit(newerActive));
    expect(result.current.defenderPursuit).toBe(newerActive);

    act(() => result.current.endDefenderPursuit());
    const newerReleased = result.current.defenderPursuit!;
    act(() => result.current.finishDefenderPursuit(olderReleased));
    expect(result.current.defenderPursuit).toBe(newerReleased);
    act(() => result.current.finishDefenderPursuit(newerReleased));
    expect(result.current.defenderPursuit).toBeNull();
  });
});
