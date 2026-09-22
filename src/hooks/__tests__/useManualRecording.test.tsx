// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { Blob as StreamingBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { computeAttackerVisuals, effectiveDefensePositions } from '@/lib/logic/engine';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';
import { MAX_MANUAL_DURATION_MS, MAX_MANUAL_EVENTS, MAX_MANUAL_FRAMES, type ManualRecording } from '@/lib/state/manualGestures';
import { decodeSituationCode, encodeGestureCode, MAX_SITUATION_JSON_BYTES } from '@/lib/state/situationCode';
import { useManualRecording } from '../useManualRecording';

function displayedFrame(x = 100): PlaybackFrame {
  const state = makeInitialState();
  const defPos = structuredClone(effectiveDefensePositions(state, 0));
  defPos.D5 = { ...defPos.D5, x, y: 200, orientation: 45, gazeOrientation: 90 };
  return {
    off: structuredClone(state.steps[0].off), defPos, carrier: 'O1',
    screen: null, offBallScreens: [], stepIdx: 0, ballPos: { x: 316, y: 454 },
    ballInFlight: false, attVisuals: computeAttackerVisuals(state, 0),
    attackerIsScreening: {}, attackerMovementType: {},
  };
}

function recording(): ManualRecording {
  return {
    durationMs: 300, events: [],
    frames: [
      { t: 0, off: { O1: { x: 300, y: 470 } }, def: { D5: { x: 100, y: 200, orientation: 45, gazeOrientation: 90, matchedTo: 'O5' } }, ball: { x: 316, y: 454 }, carrier: 'O1' },
      { t: 100, off: { O1: { x: 300, y: 470 } }, def: { D5: { x: 500, y: 200, orientation: 45, gazeOrientation: 90, matchedTo: 'O5' } }, ball: { x: 316, y: 454 }, carrier: 'O1' },
      { t: 300, off: { O1: { x: 300, y: 470 } }, def: { D5: { x: 510, y: 200, orientation: 45, gazeOrientation: 90, matchedTo: 'O5' } }, ball: { x: 316, y: 454 }, carrier: 'O1' },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom's Blob lacks stream(); codec integration needs the browser API.
  vi.stubGlobal('Blob', StreamingBlob);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useManualRecording', () => {
  it('samples displayed coordinates, clones the initial state and flushes a final render after stop in the same batch', () => {
    const state = makeInitialState();
    const before = structuredClone(state);
    const initial = displayedFrame();
    const { result } = renderHook(() => useManualRecording());
    act(() => result.current.start(state, initial));
    state.steps[0].off.O1.x = 999;
    initial.defPos.D5.x = 999;
    const changed = displayedFrame(123.456789);
    act(() => {
      result.current.recordEvent({ type: 'begin' });
      result.current.capture(changed);
    });
    changed.defPos.D5.x = 999;
    act(() => vi.advanceTimersByTime(64));
    expect(result.current.elapsedMs).toBe(64);
    act(() => result.current.recordEvent({ type: 'move', id: 'O1', x: 312.123456, y: 450 }));
    act(() => vi.advanceTimersByTime(11));
    act(() => {
      result.current.recordEvent({ type: 'end' });
      result.current.stop();
      // CourtView reports the final move from its layout effect after the click.
      result.current.capture(displayedFrame(200));
    });
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.status).toBe('ready');
    const saved = result.current.snapshot!;
    expect(saved.state).toEqual(before);
    expect(saved.recording.durationMs).toBe(75);
    expect(saved.recording.frames.map(frame => [frame.t, frame.def.D5!.x])).toEqual([[0, 100], [64, 123.457], [75, 200]]);
    expect(Object.keys(saved.recording.frames[1].def.D5!).sort()).toEqual(['gazeOrientation', 'matchedTo', 'orientation', 'x', 'y']);
    expect(saved.recording.events).toEqual([
      { t: 0, type: 'begin' },
      { t: 64, type: 'move', id: 'O1', x: 312.123, y: 450 },
      { t: 75, type: 'end' },
    ]);
  });

  it('keeps capture and input callbacks stable and buffers them without rerendering', () => {
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useManualRecording(); });
    const capture = result.current.capture;
    const recordEvent = result.current.recordEvent;
    act(() => result.current.start(makeInitialState(), displayedFrame()));
    const afterStart = renders;
    act(() => {
      for (let i = 0; i < 100; i++) {
        capture(displayedFrame(i));
        recordEvent({ type: 'move', id: 'O1', x: i, y: 400 });
      }
    });
    expect(renders).toBe(afterStart);
    act(() => vi.advanceTimersByTime(64));
    expect(result.current.capture).toBe(capture);
    expect(result.current.recordEvent).toBe(recordEvent);
  });

  it('automatically stops a moving full-minute recording within the frame and sharing budgets', async () => {
    const { result } = renderHook(() => useManualRecording());
    const frame = displayedFrame();
    let seed = 7;
    const coordinate = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed % 500_000) / 1_000 + 25; };
    let eventCount = 0;
    act(() => result.current.start(makeInitialState(), frame));
    act(() => {
      for (let elapsed = 0; elapsed < MAX_MANUAL_DURATION_MS; elapsed += 16) {
        for (const pos of Object.values(frame.off)) { pos.x = coordinate(); pos.y = coordinate(); }
        for (const pos of Object.values(frame.defPos)) { pos.x = coordinate(); pos.y = coordinate(); }
        frame.ballPos = { x: frame.off.O1.x + 16, y: frame.off.O1.y - 16 };
        result.current.capture(frame);
        // Nearly the maximum input-event budget, spread over the whole minute.
        const targetEvents = Math.floor(elapsed / MAX_MANUAL_DURATION_MS * (MAX_MANUAL_EVENTS - 1));
        while (eventCount < targetEvents) {
          result.current.recordEvent({ type: 'move', id: 'O1', x: coordinate(), y: coordinate() });
          eventCount++;
        }
        vi.advanceTimersByTime(16);
      }
    });
    expect(result.current.status).toBe('ready');
    const saved = result.current.snapshot!.recording;
    expect(saved.durationMs).toBe(MAX_MANUAL_DURATION_MS);
    expect(saved.frames[0].t).toBe(0);
    expect(saved.frames.at(-1)!.t).toBe(MAX_MANUAL_DURATION_MS);
    expect(saved.frames.length).toBeLessThanOrEqual(MAX_MANUAL_FRAMES);
    for (let index = 1; index < saved.frames.length - 1; index++) {
      expect(saved.frames[index].t - saved.frames[index - 1].t).toBeGreaterThanOrEqual(50);
    }
    expect(vi.getTimerCount()).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(result.current.snapshot)).byteLength).toBeLessThan(MAX_SITUATION_JSON_BYTES);
    vi.useRealTimers();
    const code = await encodeGestureCode(result.current.snapshot!.state, saved);
    const decoded = await decodeSituationCode(code);
    expect(decoded.recording).toEqual(saved);
  });

  it('exports reduced-format recordings without inactive players even when the supplied frame contains all five', async () => {
    const { result } = renderHook(() => useManualRecording());
    const state = makeInitialState();
    state.playerCount = 2;
    act(() => result.current.start(state, displayedFrame()));
    act(() => vi.advanceTimersByTime(64));
    act(() => {
      result.current.capture(displayedFrame(200));
      result.current.stop();
    });
    act(() => vi.advanceTimersByTime(16));
    const saved = result.current.snapshot!;
    for (const frame of saved.recording.frames) {
      expect(Object.keys(frame.off)).toEqual(['O1', 'O2']);
      expect(Object.keys(frame.def)).toEqual(['D1', 'D2']);
    }
    vi.useRealTimers();
    const code = await encodeGestureCode(saved.state, saved.recording);
    expect((await decodeSituationCode(code)).recording).toEqual(saved.recording);
  });

  it('bounds recorded input events and automatically seals the recording', () => {
    const { result } = renderHook(() => useManualRecording());
    act(() => {
      result.current.start(makeInitialState(), displayedFrame());
      for (let i = 0; i < MAX_MANUAL_EVENTS + 10; i++) result.current.recordEvent({ type: 'move', id: 'O1', x: 300, y: 470 });
    });
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.status).toBe('ready');
    expect(result.current.snapshot!.recording.events).toHaveLength(MAX_MANUAL_EVENTS);
    expect(result.current.snapshot!.recording.frames).toHaveLength(1);
    expect(result.current.snapshot!.recording.durationMs).toBe(0);
  });

  it('replays the preceding recorded frame without smoothing a jump, supports pause/seek and holds the final frame', () => {
    const { result } = renderHook(() => useManualRecording());
    const clip = recording();
    act(() => result.current.load(makeInitialState(), clip));
    clip.frames[0].def.D5!.x = 999;
    expect(result.current.status).toBe('replaying');
    expect(result.current.replayFrame!.def.D5!.x).toBe(100);
    act(() => vi.advanceTimersByTime(96));
    expect(result.current.replayFrame!.def.D5!.x).toBe(100);
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.replayFrame!.def.D5!.x).toBe(500);
    act(() => result.current.pause());
    const pausedAt = result.current.elapsedMs;
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.elapsedMs).toBe(pausedAt);
    act(() => result.current.seek(99));
    expect(result.current.status).toBe('paused');
    expect(result.current.replayFrame!.def.D5!.x).toBe(100);
    act(() => result.current.replay());
    act(() => vi.advanceTimersByTime(16));
    expect(result.current.replayFrame!.def.D5!.x).toBe(500);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.status).toBe('paused');
    expect(result.current.elapsedMs).toBe(300);
    expect(result.current.replayFrame!.def.D5!.x).toBe(510);
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.closeReplay());
    expect(result.current.status).toBe('ready');
    expect(result.current.replayFrame).toBeNull();
    act(() => result.current.replay());
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.replayFrame!.def.D5!.x).toBe(100);
    act(() => result.current.clear());
    expect(result.current.status).toBe('idle');
    expect(result.current.snapshot).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces an active replay and cancels recording/replay callbacks on unmount in StrictMode', () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => useManualRecording(), { wrapper });
    act(() => result.current.load(makeInitialState(), recording()));
    act(() => vi.advanceTimersByTime(80));
    const next = recording();
    next.frames[0].def.D5!.x = 42;
    act(() => result.current.load(makeInitialState(), next));
    expect(result.current.elapsedMs).toBe(0);
    expect(result.current.replayFrame!.def.D5!.x).toBe(42);
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.start(makeInitialState(), displayedFrame()));
    act(() => result.current.stop());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(1_000));
  });
});
