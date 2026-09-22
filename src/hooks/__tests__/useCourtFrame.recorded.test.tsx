// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { ManualGestureFrame } from '@/lib/state/manualGestures';
import { computeAttackerVisuals, effectiveDefensePositions } from '@/lib/logic/engine';
import { resolveTimelineFrame } from '@/lib/logic/playback/frameResolver';
import type { MatchState } from '@/lib/logic/match/gameLoop';
import { useCourtFrame } from '../useCourtFrame';

vi.mock('@/lib/logic/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logic/engine')>();
  return {
    ...actual,
    effectiveDefensePositions: vi.fn(actual.effectiveDefensePositions),
    computeAttackerVisuals: vi.fn(actual.computeAttackerVisuals),
  };
});
vi.mock('@/lib/logic/playback/frameResolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logic/playback/frameResolver')>();
  return { ...actual, resolveTimelineFrame: vi.fn(actual.resolveTimelineFrame) };
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function savedFrame(): ManualGestureFrame {
  const state = makeInitialState();
  return {
    t: 350,
    off: { ...state.steps[0].off, O1: { x: 100.125, y: 250.75 } },
    def: Object.fromEntries(Object.entries(state.defenseInitial).map(([id, pos]) => [id, {
      ...pos,
      // Deliberate overlap with O1: replay must not repair a recorded bug.
      ...(id === 'D5' ? { x: 100.125, y: 250.75 } : {}),
      orientation: 123.456,
      gazeOrientation: 145.678,
      matchedTo: `O${id.slice(1)}`,
    }])),
    ball: { x: 117.25, y: 234.5 },
    carrier: 'O1',
  };
}

describe('recorded manual frames', () => {
  it('preserves every recorded coordinate and defender angle ahead of all engine frames', () => {
    vi.useFakeTimers();
    const state = makeInitialState();
    state.steps.push(structuredClone(state.steps[0]));
    const original = structuredClone(state);
    const recordedFrame = savedFrame();
    const onFrameChange = vi.fn();
    const onPlaybackTick = vi.fn();
    const { result } = renderHook(() => useCourtFrame({
      state, recordedFrame,
      isPlaying: true, playbackSpeed: 1, playbackStartT: 0,
      scrubT: 0.5, exportT: 0.75,
      liveMatchState: { off: state.steps[0].off } as MatchState,
      defenderPursuit: { snapshot: state.defenseInitial, active: true, startedAtMs: performance.now(), stepIndex: 0 },
      defenseReleaseTransition: { fromPositions: state.defenseInitial, startedAtMs: performance.now(), durationMs: 500 },
      onFrameChange, onPlaybackTick,
    }));
    act(() => vi.advanceTimersByTime(1_000));
    const frame = result.current.frame;
    expect(frame.off).toEqual(recordedFrame.off);
    expect(frame.ballPos).toEqual(recordedFrame.ball);
    expect(frame.carrier).toBe(recordedFrame.carrier);
    expect(Object.fromEntries(Object.entries(frame.defPos).map(([id, pos]) => [id, {
      x: pos.x, y: pos.y, orientation: pos.orientation,
      gazeOrientation: pos.gazeOrientation, matchedTo: pos.matchedTo,
    }]))).toEqual(recordedFrame.def);
    expect(frame.defPos.D5.facing.x).toBeCloseTo(100.125 + Math.sin(145.678 * Math.PI / 180) * 30);
    expect(onFrameChange.mock.lastCall?.[0]).toMatchObject({ frame, dynamic: true });
    expect(effectiveDefensePositions).not.toHaveBeenCalled();
    expect(computeAttackerVisuals).not.toHaveBeenCalled();
    expect(resolveTimelineFrame).not.toHaveBeenCalled();
    expect(onPlaybackTick).not.toHaveBeenCalled();
    expect(state).toEqual(original);
  });

  it('updates directly to the selected recorded sample while keeping absent players absent', () => {
    const state = { ...makeInitialState(), playerCount: 2 as const };
    const full = savedFrame();
    const recordedFrame: ManualGestureFrame = {
      ...full,
      off: { O1: full.off.O1, O2: full.off.O2 },
      def: { D1: full.def.D1, D2: full.def.D2 },
    };
    const { result, rerender } = renderHook(({ saved }) => useCourtFrame({
      state, recordedFrame: saved, isPlaying: false, playbackSpeed: 1,
      playbackStartT: 0, scrubT: null,
    }), { initialProps: { saved: recordedFrame } });
    const next: ManualGestureFrame = {
      ...recordedFrame, t: 400,
      off: { ...recordedFrame.off, O1: { x: 301.25, y: 450.5 } },
      def: { ...recordedFrame.def, D2: { ...recordedFrame.def.D2!, x: 555.123, y: 20.456 } },
      ball: { x: 317.25, y: 434.5 },
    };
    rerender({ saved: next });
    expect(result.current.frame.off).toEqual(next.off);
    expect(Object.keys(result.current.frame.defPos)).toEqual(['D1', 'D2']);
    expect(result.current.frame.defPos.D2).toMatchObject(next.def.D2!);
    expect(result.current.frame.ballPos).toEqual(next.ball);
    expect(result.current.frame.attVisuals.O2.armBallSide).not.toEqual(full.ball);
    expect(effectiveDefensePositions).not.toHaveBeenCalled();
  });
});
