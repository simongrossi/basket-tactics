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
}): PlaybackTick {
  const totalSteps = Math.max(0, params.totalSteps);
  const stepDuration = playbackStepDurationMs(params.speed, params.realSpeedMode);
  const rawT = params.startT + params.elapsedMs / stepDuration;
  if (rawT >= totalSteps) return { t: totalSteps, ended: true };
  return { t: Math.max(0, rawT), ended: false };
}
