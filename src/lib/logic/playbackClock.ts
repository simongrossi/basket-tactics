import type { AppState } from '../types';
import { fullStepToSeconds, secondsToFullStep, totalDurationSeconds } from './timecode';
import { PLAYBACK_STEP_DURATION_MS } from '@/lib/data/physics';

export interface PlaybackTick {
  t: number;
  ended: boolean;
}

export function playbackStepDurationMs(speed: number, realSpeedMode?: boolean): number {
  const baseDuration = realSpeedMode ? 500 : PLAYBACK_STEP_DURATION_MS;
  return baseDuration / speed;
}

export function playbackTickAtElapsed(params: {
  startT: number;
  elapsedMs: number;
  speed: number;
  totalSteps: number;
  realSpeedMode?: boolean;
  state?: AppState;
}): PlaybackTick {
  if (params.state) {
    const elapsed = fullStepToSeconds(params.state, params.startT)
      + Math.max(0, params.elapsedMs) / 1000 * Math.max(0, params.speed);
    return { t: secondsToFullStep(params.state, elapsed), ended: elapsed >= totalDurationSeconds(params.state) };
  }
  const totalSteps = Math.max(0, params.totalSteps);
  const stepDuration = playbackStepDurationMs(params.speed, params.realSpeedMode);
  const rawT = params.startT + params.elapsedMs / stepDuration;
  if (rawT >= totalSteps) return { t: totalSteps, ended: true };
  return { t: Math.max(0, rawT), ended: false };
}
