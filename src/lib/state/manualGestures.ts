import type { AttackerId, DefenderId, PlayerId, Point } from '@/lib/types';

export const MAX_MANUAL_DURATION_MS = 60_000;
export const MAX_MANUAL_FRAMES = 1_202;
export const MAX_MANUAL_EVENTS = 10_000;
export const MANUAL_SAMPLE_INTERVAL_MS = 50;

/** Displayed coordinates sampled in milliseconds from the recording start. */
export interface ManualGestureFrame {
  t: number;
  off: Partial<Record<AttackerId, Point>>;
  def: Partial<Record<DefenderId, {
    x: number;
    y: number;
    orientation: number;
    gazeOrientation: number;
    matchedTo: AttackerId;
  }>>;
  ball: Point;
  carrier: AttackerId;
}

/** Input requested by the coach, before movement/collision constraints. */
export type ManualGestureEvent =
  | { t: number; type: 'begin' | 'end' }
  | { t: number; type: 'move'; id: PlayerId; x: number; y: number };

export interface ManualRecording {
  durationMs: number;
  frames: ManualGestureFrame[];
  events: ManualGestureEvent[];
}
