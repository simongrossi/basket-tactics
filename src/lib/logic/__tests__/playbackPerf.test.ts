import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import type { AppState } from '@/lib/types';
import { resolveFrameAt, type PlaybackFrame } from '../playback/frameResolver';

const PROFILE_IDS = [
  'screen-lab-pnr',
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

describe('resolveFrameAt profiling', () => {
  it('reste opt-in', () => {
    const frame = resolveFrameAt(buildState('screen-lab-pnr'), 0.5);
    expect(frame?.profile).toBeUndefined();
  });

  it('expose un profil par phase quand demandé', () => {
    const frame = resolveFrameAt(buildState('screen-lab-pnr'), 0.5, { profile: true });
    expect(frame?.profile?.totalMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(frame!.profile!.phases).sort()).toEqual([
      'attackers',
      'ball',
      'collisions',
      'defenders',
      'obstacles',
      'rateLimiter',
      'screens',
    ]);
  });

  it('garde un budget moyen raisonnable sur les scénarios écran', () => {
    const samples: number[] = [];
    PROFILE_IDS.forEach((tplId) => {
      const state = buildState(tplId);
      let prev: PlaybackFrame | null = null;
      const transitions = state.steps.length - 1;
      for (let f = 0; f <= transitions * 30; f++) {
        const t = f / 30;
        const frame = resolveFrameAt(state, t, {
          prevFrame: prev ?? undefined,
          profile: true,
        });
        if (!frame) continue;
        samples.push(frame.profile!.totalMs);
        prev = frame;
      }
    });

    const avg = samples.reduce((sum, n) => sum + n, 0) / samples.length;
    expect(avg).toBeLessThan(8);
  });
});
