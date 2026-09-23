// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import type { AppState, ComputedDefense, DefenderId, Point } from '@/lib/types';
import type { DefenderPursuit } from '../useAppState';
import { useCourtFrame } from '../useCourtFrame';

vi.mock('@/lib/logic/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logic/engine')>();
  return { ...actual, effectiveDefensePositions: vi.fn() };
});

function setup() {
  const state = makeInitialState();
  state.defenseSystem = 'zone';
  state.defenseMaxSpeed = 80;
  state.secondsPerStep = 2;
  for (const rule of Object.values(state.rules)) rule.maxSpeed = 80;
  const target = Object.fromEntries(Object.entries(state.defenseInitial).map(([id, pos]) => [id, {
    ...pos,
    late: false,
    helpFactor: 0,
    isCarrierDefender: id === 'D1',
    matchedTo: `O${id.slice(1)}`,
    onScreen: false,
    switchedThisStep: false,
  }])) as ComputedDefense;
  // A small carrier move may switch a zone's tactical target by several metres.
  // The displayed defender must still cover that distance at a bounded speed.
  target.D5 = { ...target.D5, x: 500, y: 200 };
  vi.mocked(effectiveDefensePositions).mockReturnValue(target);
  const snapshot = Object.fromEntries(Object.entries(target).map(([id, pos]) => [id, { x: pos.x, y: pos.y }])) as Record<DefenderId, Point>;
  snapshot.D5 = { x: 100, y: 200 };
  const pursuit: DefenderPursuit = { snapshot, active: true, startedAtMs: performance.now(), stepIndex: 0 };
  const onDefenderPursuitSettled = vi.fn();
  const initialProps = { state, defenderPursuit: pursuit };
  const hook = renderHook(({ state: cur, defenderPursuit }) => useCourtFrame({
    state: cur,
    defenderPursuit,
    isPlaying: false,
    playbackSpeed: 1,
    playbackStartT: 0,
    scrubT: null,
    onDefenderPursuitSettled,
  }), { initialProps });
  return { ...hook, state, pursuit, target, onDefenderPursuitSettled };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('defender pursuit while editing positions', () => {
  it('starts at the displayed position and bounds every frame even for a target over 200px away', () => {
    const { result } = setup();
    expect(result.current.frame.defPos.D5.x).toBe(100);
    let previousX = 100;
    for (let frame = 0; frame < 10; frame++) {
      act(() => vi.advanceTimersByTime(16));
      const x = result.current.frame.defPos.D5.x;
      expect(x).toBeGreaterThan(previousX);
      expect(x - previousX).toBeLessThanOrEqual(40 * 0.016 + 1e-6);
      expect(result.current.frame.defPos.D5.y).toBe(200);
      previousX = x;
    }
  });

  it('continues from the current position on release until arrival, including a chase lasting over five seconds', () => {
    const { result, rerender, state, pursuit, target, onDefenderPursuitSettled } = setup();
    act(() => vi.advanceTimersByTime(160));
    const beforeRelease = result.current.frame.defPos.D5.x;
    const released = { ...pursuit, active: false };
    rerender({ state, defenderPursuit: released });
    expect(result.current.frame.defPos.D5.x).toBe(beforeRelease);
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.frame.defPos.D5.x).toBeGreaterThan(beforeRelease);
    expect(result.current.frame.defPos.D5.x - beforeRelease).toBeLessThanOrEqual(0.64 + 1e-6);
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.frame.defPos.D5.x).toBeLessThan(target.D5.x);
    expect(onDefenderPursuitSettled).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(11_000));
    expect(result.current.frame.defPos.D5.x).toBe(target.D5.x);
    expect(result.current.frame.defPos.D5.y).toBe(target.D5.y);
    expect(onDefenderPursuitSettled).toHaveBeenCalledExactlyOnceWith(released);
    act(() => vi.advanceTimersByTime(1_000));
    expect(onDefenderPursuitSettled).toHaveBeenCalledTimes(1);
  });

  it('keeps tracking while a drag is active even after every defender reaches its target', () => {
    const { result, rerender, state, pursuit, target, onDefenderPursuitSettled } = setup();
    act(() => vi.advanceTimersByTime(11_000));
    expect(result.current.frame.defPos.D5.x).toBe(target.D5.x);
    expect(onDefenderPursuitSettled).not.toHaveBeenCalled();
    const released = { ...pursuit, active: false };
    rerender({ state, defenderPursuit: released });
    act(() => vi.advanceTimersByTime(16));
    expect(onDefenderPursuitSettled).toHaveBeenCalledExactlyOnceWith(released);
  });

  it('bounds the first resumed frame after the browser pauses animation callbacks', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(16));
    const beforePause = result.current.frame.defPos.D5.x;
    // Simulate one delayed callback, rather than many normal animation frames.
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 2_000);
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.frame.defPos.D5.x).toBeGreaterThan(beforePause);
    expect(result.current.frame.defPos.D5.x - beforePause).toBeLessThanOrEqual(40 * 0.050 + 1e-6);
  });

  it('uses a newly captured displayed snapshot immediately when another drag starts', () => {
    const { result, rerender, state, pursuit } = setup();
    act(() => vi.advanceTimersByTime(160));
    rerender({ state, defenderPursuit: { ...pursuit, active: false } });
    act(() => vi.advanceTimersByTime(160));
    const displayed = result.current.frame.defPos.D5;
    const renewed: DefenderPursuit = {
      ...pursuit,
      startedAtMs: performance.now(),
      snapshot: { ...pursuit.snapshot, D5: { x: displayed.x, y: displayed.y } },
    };
    rerender({ state, defenderPursuit: renewed });
    expect(result.current.frame.defPos.D5.x).toBe(displayed.x);
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.frame.defPos.D5.x).toBeGreaterThan(displayed.x);
    expect(result.current.frame.defPos.D5.x - displayed.x).toBeLessThanOrEqual(0.64 + 1e-6);
  });

  it('does not carry a pursuit into another step', () => {
    const { result, rerender, state, pursuit, target } = setup();
    act(() => vi.advanceTimersByTime(16));
    const nextStep: AppState = { ...state, steps: [...state.steps, structuredClone(state.steps[0])], activeStep: 1 };
    rerender({ state: nextStep, defenderPursuit: pursuit });
    expect(result.current.frame.defPos.D5.x).toBe(target.D5.x);
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.frame.defPos.D5.x).toBe(target.D5.x);
  });

  it('accelerates with recovery sprint boost in man defense when trailing far behind target', () => {
    const { result, state, pursuit } = setup();
    state.defenseSystem = 'man';
    // D5 is trailing by 400px (100 -> 500)
    act(() => vi.advanceTimersByTime(16));
    const deltaX = result.current.frame.defPos.D5.x - 100;
    // Base is 40 * 0.016 = 0.64. With recovery sprint boost (up to 2.4), deltaX should exceed 0.64
    expect(deltaX).toBeGreaterThan(0.64);
    expect(deltaX).toBeLessThanOrEqual(0.64 * 2.4 + 1e-6);
  });
});
