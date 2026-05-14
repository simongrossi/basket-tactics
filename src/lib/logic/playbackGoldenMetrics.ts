import type { AppState, Point } from '@/lib/types';
import { resolveFrameAt, type PlaybackFrame } from './playback/frameResolver';

export interface PlaybackGoldenMetrics {
  frames: number;
  maxAttackerJumpPx: number;
  maxDefenderJumpPx: number;
  minPlayerClearancePx: number;
  screenContactFrames: number;
  averageResolveMs: number;
}

export function collectPlaybackGoldenMetrics(
  state: AppState,
  options: { fps?: number } = {}
): PlaybackGoldenMetrics {
  const fps = options.fps ?? 30;
  const transitions = state.steps.length - 1;
  const totalFrames = Math.max(0, transitions * fps);
  let prevFrame: PlaybackFrame | null = null;
  let frames = 0;
  let maxAttackerJumpPx = 0;
  let maxDefenderJumpPx = 0;
  let minPlayerClearancePx = Infinity;
  let screenContactFrames = 0;
  let totalResolveMs = 0;

  for (let f = 0; f <= totalFrames; f++) {
    const t = fps > 0 ? f / fps : 0;
    const frame = resolveFrameAt(state, t, {
      prevFrame: prevFrame ?? undefined,
      collectDecisions: true,
      profile: true,
    });
    if (!frame) continue;
    frames++;
    totalResolveMs += frame.profile?.totalMs ?? 0;
    minPlayerClearancePx = Math.min(minPlayerClearancePx, minClearance(frame));
    if (hasScreenContact(frame)) screenContactFrames++;

    if (prevFrame) {
      Object.entries(frame.off).forEach(([id, point]) => {
        const prev = prevFrame?.off[id as keyof typeof frame.off];
        if (!prev) return;
        maxAttackerJumpPx = Math.max(maxAttackerJumpPx, distance(prev, point));
      });
      Object.entries(frame.defPos).forEach(([id, point]) => {
        const prev = prevFrame?.defPos[id as keyof typeof frame.defPos];
        if (!prev) return;
        maxDefenderJumpPx = Math.max(maxDefenderJumpPx, distance(prev, point));
      });
    }

    prevFrame = frame;
  }

  return {
    frames,
    maxAttackerJumpPx,
    maxDefenderJumpPx,
    minPlayerClearancePx: Number.isFinite(minPlayerClearancePx) ? minPlayerClearancePx : 0,
    screenContactFrames,
    averageResolveMs: frames > 0 ? totalResolveMs / frames : 0,
  };
}

function hasScreenContact(frame: PlaybackFrame): boolean {
  return Object.values(frame.debug?.defenders ?? {}).some((decision) =>
    !!decision?.screenState || !!decision?.screenMode || !!decision?.contactKey
  );
}

function minClearance(frame: PlaybackFrame): number {
  const players: Point[] = [
    ...Object.values(frame.off),
    ...Object.values(frame.defPos).map((p) => ({ x: p.x, y: p.y })),
  ];
  let min = Infinity;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      min = Math.min(min, distance(players[i], players[j]));
    }
  }
  return min;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
