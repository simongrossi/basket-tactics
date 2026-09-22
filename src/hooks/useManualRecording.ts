import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, Point } from '@/lib/types';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';
import { getActiveAttackerIds, getActiveDefenderIds } from '@/lib/logic/players';
import {
  MANUAL_SAMPLE_INTERVAL_MS,
  MAX_MANUAL_DURATION_MS,
  MAX_MANUAL_EVENTS,
  MAX_MANUAL_FRAMES,
  type ManualGestureEvent,
  type ManualGestureFrame,
  type ManualRecording,
} from '@/lib/state/manualGestures';

export type ManualRecordingStatus = 'idle' | 'recording' | 'ready' | 'replaying' | 'paused';
export interface ManualRecordingSnapshot { state: AppState; recording: ManualRecording }
type WithoutTime<T> = T extends unknown ? Omit<T, 't'> : never;
export type ManualRecordingInputEvent = WithoutTime<ManualGestureEvent>;

interface RecordingView {
  status: ManualRecordingStatus;
  snapshot: ManualRecordingSnapshot | null;
  elapsedMs: number;
  replayFrame: ManualGestureFrame | null;
}

interface RecordingSession {
  state: AppState;
  startedAt: number;
  frames: ManualGestureFrame[];
  events: ManualGestureEvent[];
  lastSampleAt: number;
  stopAt: number | null;
}

const idleView: RecordingView = { status: 'idle', snapshot: null, elapsedMs: 0, replayFrame: null };
const round = (value: number) => Math.round(value * 1_000) / 1_000;
const point = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });

/** Store only what was displayed, without engine caches or diagnostic metadata. */
function captureFrame(frame: PlaybackFrame, state: AppState): Omit<ManualGestureFrame, 't'> {
  const off: ManualGestureFrame['off'] = {};
  const def: ManualGestureFrame['def'] = {};
  for (const id of getActiveAttackerIds(state.playerCount)) {
    const p = frame.off[id];
    if (p) off[id] = point(p);
  }
  for (const id of getActiveDefenderIds(state.playerCount)) {
    const p = frame.defPos[id];
    if (p) def[id] = {
      ...point(p),
      orientation: round(p.orientation ?? 0),
      gazeOrientation: round(p.gazeOrientation ?? p.orientation ?? 0),
      matchedTo: p.matchedTo,
    };
  }
  return { off, def, ball: point(frame.ballPos), carrier: frame.carrier };
}

/** A recorded jump must remain visible: replay uses the preceding sample. */
function frameAt(recording: ManualRecording, elapsedMs: number): ManualGestureFrame {
  let low = 0;
  let high = recording.frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (recording.frames[middle].t <= elapsedMs) low = middle;
    else high = middle - 1;
  }
  return recording.frames[low];
}

/** Records displayed frames and coach input without modifying the edited system. */
export function useManualRecording() {
  const [view, setView] = useState<RecordingView>(idleView);
  const viewRef = useRef(view);
  const sessionRef = useRef<RecordingSession | null>(null);
  const latestFrameRef = useRef<Omit<ManualGestureFrame, 't'> | null>(null);
  const snapshotRef = useRef<ManualRecordingSnapshot | null>(null);
  const rafRef = useRef<number | null>(null);
  const replayClockRef = useRef({ startedAt: 0, offsetMs: 0 });

  const publish = useCallback((next: RecordingView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const cancelFrame = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const finishRecording = useCallback((session: RecordingSession, durationMs: number) => {
    if (sessionRef.current !== session || !latestFrameRef.current) return;
    const final = { ...latestFrameRef.current, t: durationMs };
    const last = session.frames[session.frames.length - 1];
    if (last.t === durationMs || session.frames.length >= MAX_MANUAL_FRAMES) {
      session.frames[session.frames.length - 1] = final;
    } else {
      session.frames.push(final);
    }
    const snapshot: ManualRecordingSnapshot = {
      state: session.state,
      recording: { durationMs, frames: session.frames, events: session.events },
    };
    sessionRef.current = null;
    snapshotRef.current = snapshot;
    latestFrameRef.current = null;
    publish({ status: 'ready', snapshot, elapsedMs: durationMs, replayFrame: null });
  }, [publish]);

  const recordTick = useCallback(function tick() {
    rafRef.current = null;
    const session = sessionRef.current;
    if (!session || !latestFrameRef.current) return;
    // stop() leaves one animation frame for the last React render/capture.
    // Its requested time is frozen, so waiting does not extend the recording.
    if (session.stopAt !== null) {
      finishRecording(session, session.stopAt);
      return;
    }
    const elapsedMs = Math.min(MAX_MANUAL_DURATION_MS, Math.max(0, Math.round(performance.now() - session.startedAt)));
    if (elapsedMs >= MAX_MANUAL_DURATION_MS || session.frames.length >= MAX_MANUAL_FRAMES - 1) {
      finishRecording(session, elapsedMs);
      return;
    }
    if (elapsedMs - session.lastSampleAt >= MANUAL_SAMPLE_INTERVAL_MS) {
      session.frames.push({ ...latestFrameRef.current, t: elapsedMs });
      session.lastSampleAt = elapsedMs;
      publish({ status: 'recording', snapshot: null, elapsedMs, replayFrame: null });
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [finishRecording, publish]);

  const replayTick = useCallback(function tick() {
    rafRef.current = null;
    const snapshot = snapshotRef.current;
    if (!snapshot || viewRef.current.status !== 'replaying') return;
    const elapsedMs = Math.min(snapshot.recording.durationMs, Math.max(0, Math.round(
      replayClockRef.current.offsetMs + performance.now() - replayClockRef.current.startedAt,
    )));
    const status = elapsedMs >= snapshot.recording.durationMs ? 'paused' : 'replaying';
    publish({ status, snapshot, elapsedMs, replayFrame: frameAt(snapshot.recording, elapsedMs) });
    if (status === 'replaying') rafRef.current = requestAnimationFrame(tick);
  }, [publish]);

  const beginReplay = useCallback((elapsedMs: number) => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    cancelFrame();
    replayClockRef.current = { startedAt: performance.now(), offsetMs: elapsedMs };
    const status = elapsedMs >= snapshot.recording.durationMs ? 'paused' : 'replaying';
    publish({ status, snapshot, elapsedMs, replayFrame: frameAt(snapshot.recording, elapsedMs) });
    if (status === 'replaying') rafRef.current = requestAnimationFrame(replayTick);
  }, [cancelFrame, publish, replayTick]);

  const start = useCallback((state: AppState, frame: PlaybackFrame) => {
    cancelFrame();
    const captured = captureFrame(frame, state);
    sessionRef.current = {
      state: structuredClone(state), startedAt: performance.now(),
      frames: [{ ...captured, t: 0 }], events: [], lastSampleAt: 0, stopAt: null,
    };
    latestFrameRef.current = captured;
    snapshotRef.current = null;
    publish({ status: 'recording', snapshot: null, elapsedMs: 0, replayFrame: null });
    rafRef.current = requestAnimationFrame(recordTick);
  }, [cancelFrame, publish, recordTick]);

  // These callbacks never render. CourtView can safely retain them in its
  // frame notification effect while recording buffers are updated in refs.
  const capture = useCallback((frame: PlaybackFrame) => {
    const session = sessionRef.current;
    if (session) latestFrameRef.current = captureFrame(frame, session.state);
  }, []);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (session && session.stopAt === null) {
      session.stopAt = Math.min(MAX_MANUAL_DURATION_MS, Math.max(0, Math.round(performance.now() - session.startedAt)));
    }
  }, []);

  const recordEvent = useCallback((event: ManualRecordingInputEvent) => {
    const session = sessionRef.current;
    if (!session || session.stopAt !== null) return;
    const t = Math.min(MAX_MANUAL_DURATION_MS, Math.max(0, Math.round(performance.now() - session.startedAt)));
    if (t >= MAX_MANUAL_DURATION_MS) { session.stopAt = MAX_MANUAL_DURATION_MS; return; }
    const captured: ManualGestureEvent = event.type === 'move'
      ? { t, type: 'move', id: event.id, x: round(event.x), y: round(event.y) }
      : { t, type: event.type };
    session.events.push(captured);
    if (session.events.length >= MAX_MANUAL_EVENTS) session.stopAt = t;
  }, []);

  const load = useCallback((state: AppState, recording: ManualRecording) => {
    cancelFrame();
    sessionRef.current = null;
    latestFrameRef.current = null;
    snapshotRef.current = structuredClone({ state, recording });
    beginReplay(0);
  }, [beginReplay, cancelFrame]);

  const replay = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot || sessionRef.current) return;
    const current = viewRef.current;
    const elapsedMs = current.status === 'paused' && current.elapsedMs < snapshot.recording.durationMs ? current.elapsedMs : 0;
    beginReplay(elapsedMs);
  }, [beginReplay]);

  const pause = useCallback(() => {
    if (viewRef.current.status !== 'replaying') return;
    cancelFrame();
    const snapshot = snapshotRef.current!;
    const elapsedMs = Math.min(snapshot.recording.durationMs, Math.max(0, Math.round(
      replayClockRef.current.offsetMs + performance.now() - replayClockRef.current.startedAt,
    )));
    publish({ status: 'paused', snapshot, elapsedMs, replayFrame: frameAt(snapshot.recording, elapsedMs) });
  }, [cancelFrame, publish]);

  const seek = useCallback((ms: number) => {
    const snapshot = snapshotRef.current;
    if (!snapshot || sessionRef.current) return;
    const elapsedMs = Math.min(snapshot.recording.durationMs, Math.max(0, Number.isFinite(ms) ? Math.round(ms) : 0));
    if (viewRef.current.status === 'replaying') {
      beginReplay(elapsedMs);
    } else {
      cancelFrame();
      publish({ status: 'paused', snapshot, elapsedMs, replayFrame: frameAt(snapshot.recording, elapsedMs) });
    }
  }, [beginReplay, cancelFrame, publish]);

  const closeReplay = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot || sessionRef.current) return;
    cancelFrame();
    publish({ status: 'ready', snapshot, elapsedMs: snapshot.recording.durationMs, replayFrame: null });
  }, [cancelFrame, publish]);

  const clear = useCallback(() => {
    cancelFrame();
    sessionRef.current = null;
    snapshotRef.current = null;
    latestFrameRef.current = null;
    publish(idleView);
  }, [cancelFrame, publish]);

  useEffect(() => () => {
    cancelFrame();
    sessionRef.current = null;
  }, [cancelFrame]);

  return { ...view, start, capture, recordEvent, stop, load, replay, pause, seek, closeReplay, clear };
}
