import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { TEMPLATES } from '@/lib/data/templates';
import type { AppState, Point } from '@/lib/types';
import { resolveFrameAt, type PlaybackFrame } from '../playback/frameResolver';

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  return {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    activeStep: 0,
  };
}

function minClearance(frame: PlaybackFrame): number {
  const players: Point[] = [
    ...Object.values(frame.off),
    ...Object.values(frame.defPos).map((p) => ({ x: p.x, y: p.y })),
  ];
  let min = Infinity;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      min = Math.min(min, Math.hypot(players[i].x - players[j].x, players[i].y - players[j].y));
    }
  }
  return min;
}

describe('interpolated frame collision pass', () => {
  it('conserve une clearance visuelle pendant un pindown avec trajectoires croisées', () => {
    const state = buildState('screen-lab-pindown');
    let prev: PlaybackFrame | null = null;
    let min = Infinity;
    for (let f = 0; f <= 120; f++) {
      const frame = resolveFrameAt(state, f / 60, { prevFrame: prev ?? undefined });
      expect(frame).not.toBeNull();
      min = Math.min(min, minClearance(frame!));
      prev = frame;
    }

    expect(min).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX * 0.7 - 0.5);
  });

  it('ne crée pas de saut visible pendant la correction finale', () => {
    const state = buildState('screen-lab-chain-stagger');
    let prev: PlaybackFrame | null = null;
    let maxJump = 0;
    for (let f = 0; f <= 120; f++) {
      const frame = resolveFrameAt(state, f / 60, { prevFrame: prev ?? undefined });
      expect(frame).not.toBeNull();
      if (prev && frame) {
        Object.entries(frame.defPos).forEach(([id, point]) => {
          const previous = prev!.defPos[id as keyof typeof frame.defPos];
          maxJump = Math.max(maxJump, Math.hypot(point.x - previous.x, point.y - previous.y));
        });
        Object.entries(frame.off).forEach(([id, point]) => {
          const previous = prev!.off[id as keyof typeof frame.off];
          maxJump = Math.max(maxJump, Math.hypot(point.x - previous.x, point.y - previous.y));
        });
      }
      prev = frame;
    }

    expect(maxJump).toBeLessThanOrEqual(20);
  });
});
