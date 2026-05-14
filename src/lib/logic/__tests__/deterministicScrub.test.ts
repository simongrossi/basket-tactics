import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import type { AppState } from '@/lib/types';
import {
  resolveFrameAt,
  resolveFrameAtDeterministicScrub,
  type PlaybackFrame,
} from '../playback/frameResolver';

const TEMPLATE_IDS = [
  'screen-lab-pnr',
  'screen-lab-pindown',
  'screen-lab-offball',
  'screen-lab-chain-stagger',
  'ucla-cut',
] as const;

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  return {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    activeStep: 0,
  };
}

function maxPlayerJump(a: PlaybackFrame, b: PlaybackFrame): { player: string; jump: number } {
  let max = { player: '', jump: 0 };
  Object.entries(b.off).forEach(([id, point]) => {
    const prev = a.off[id as keyof typeof b.off];
    if (!prev) return;
    const jump = Math.hypot(point.x - prev.x, point.y - prev.y);
    if (jump > max.jump) max = { player: id, jump };
  });
  Object.entries(b.defPos).forEach(([id, point]) => {
    const prev = a.defPos[id as keyof typeof b.defPos];
    if (!prev) return;
    const jump = Math.hypot(point.x - prev.x, point.y - prev.y);
    if (jump > max.jump) max = { player: id, jump };
  });
  return max;
}

describe('resolveFrameAtDeterministicScrub', () => {
  it('reproduit une lecture déterministe depuis le début de la timeline', () => {
    const state = buildState('screen-lab-offball');

    for (let f = 1; f <= 36; f++) {
      const t = 1 + f / 60;
      const playback = resolvePlaybackFromStart(state, t);
      const scrub = resolveFrameAtDeterministicScrub(state, t, {
        collectDecisions: true,
      });
      expect(scrub, `t=${t.toFixed(3)}`).toEqual(playback);
    }
  });

  it('reste fluide quand le scrub est recalculé from scratch frame par frame', () => {
    TEMPLATE_IDS.forEach((tplId) => {
      const state = buildState(tplId);
      const transitions = state.steps.length - 1;
      for (let idx = 0; idx < transitions; idx++) {
        let prev: PlaybackFrame | null = null;
        for (let f = 0; f <= 60; f++) {
          const t = idx + f / 60;
          const frame = resolveFrameAtDeterministicScrub(state, t, {
            collectDecisions: true,
          });
          expect(frame, `${tplId} t=${t.toFixed(3)}`).not.toBeNull();
          if (prev && frame) {
            const max = maxPlayerJump(prev, frame);
            expect(max.jump, `${tplId} t=${t.toFixed(3)} ${max.player}`)
              .toBeLessThanOrEqual(20);
          }
          prev = frame;
        }
      }
    });
  });
});

function resolvePlaybackFromStart(state: AppState, t: number, fps: number = 60): PlaybackFrame | null {
  const target = Math.max(0, Math.min(state.steps.length - 1, t));
  let prev = resolveFrameAt(state, 0, { collectDecisions: true });
  if (!prev) return null;
  if (target <= 0) return prev;

  const totalWholeFrames = Math.floor(target * fps);
  for (let f = 1; f <= totalWholeFrames; f++) {
    const frame = resolveFrameAt(state, f / fps, {
      prevFrame: prev,
      collectDecisions: true,
    });
    if (!frame) return prev;
    prev = frame;
  }

  const lastSample = totalWholeFrames / fps;
  if (Math.abs(lastSample - target) < 0.000001) return prev;
  return resolveFrameAt(state, target, {
    prevFrame: prev,
    collectDecisions: true,
  });
}
