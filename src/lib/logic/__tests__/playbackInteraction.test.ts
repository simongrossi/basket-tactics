import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { Annotation, AppState, Step } from '@/lib/types';
import { resolveFrameAt } from '../playback/frameResolver';
import { playbackTickAtElapsed } from '../playbackClock';

function buildRecoverScenario(quality: number = 100): AppState {
  const base = makeInitialState();
  const annotations: Annotation[] = [
    {
      type: 'screen',
      fromId: 'O3',
      toId: 'O1',
      from: { x: 470, y: 380 },
      to: { x: 320, y: 460 },
      quality,
    } as Annotation,
  ];
  const step0: Step = {
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations,
  };
  const step1: Step = {
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 320, y: 460 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations: [],
  };
  const step2: Step = {
    off: {
      O1: { x: 390, y: 430 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations: [
      {
        type: 'dribble',
        fromId: 'O1',
        toId: null,
        from: { x: 300, y: 470 },
        to: { x: 390, y: 430 },
      } as Annotation,
    ],
  };
  return {
    ...base,
    steps: [step0, step1, step2],
    screenRule: 'hedge',
    defenseInitial: {
      D1: { x: 300, y: 460 },
      D2: { x: 130, y: 370 },
      D3: { x: 460, y: 370 },
      D4: { x: 220, y: 220 },
      D5: { x: 380, y: 220 },
    },
    activeStep: 0,
  } as AppState;
}

describe('playback interaction — scrub/pause/reprise', () => {
  it('reprendre depuis un scrub conserve le même t au premier tick', () => {
    const pausedT = 1.45;
    const tick = playbackTickAtElapsed({
      startT: pausedT,
      elapsedMs: 0,
      speed: 1,
      totalSteps: 2,
    });

    expect(tick).toEqual({ t: pausedT, ended: false });
  });

  it('écran + pause/reprise : la frame reprise est identique à la frame scrub', () => {
    const state = buildRecoverScenario(100);
    const pausedT = 1.5;
    const scrubFrame = resolveFrameAt(state, pausedT, { stepIdx: Math.round(pausedT) });
    const tick = playbackTickAtElapsed({
      startT: pausedT,
      elapsedMs: 0,
      speed: 1,
      totalSteps: state.steps.length - 1,
    });
    const resumedFrame = resolveFrameAt(state, tick.t);

    expect(scrubFrame).not.toBeNull();
    expect(resumedFrame).not.toBeNull();
    expect(resumedFrame!.defPos.D1.x).toBeCloseTo(scrubFrame!.defPos.D1.x, 6);
    expect(resumedFrame!.defPos.D1.y).toBeCloseTo(scrubFrame!.defPos.D1.y, 6);
    expect(resumedFrame!.defPos.D1.screenPhase).toBe('stuck');
  });

  it('le tick suivant après reprise avance sans saut visuel sur D1', () => {
    const state = buildRecoverScenario(100);
    const pausedT = 1.5;
    const before = resolveFrameAt(state, pausedT);
    const nextTick = playbackTickAtElapsed({
      startT: pausedT,
      elapsedMs: 33,
      speed: 1,
      totalSteps: state.steps.length - 1,
    });
    const after = resolveFrameAt(state, nextTick.t);

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    const jump = Math.hypot(
      after!.defPos.D1.x - before!.defPos.D1.x,
      after!.defPos.D1.y - before!.defPos.D1.y
    );
    expect(jump).toBeLessThan(6);
  });

  it('clamp en fin de lecture et signale ended', () => {
    const tick = playbackTickAtElapsed({
      startT: 1.9,
      elapsedMs: 1000,
      speed: 1,
      totalSteps: 2,
    });

    expect(tick).toEqual({ t: 2, ended: true });
  });
});
