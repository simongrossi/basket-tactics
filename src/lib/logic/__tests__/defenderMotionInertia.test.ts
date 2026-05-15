import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, Step } from '@/lib/types';
import { resolveFrameAt, type PlaybackFrame } from '../playback/frameResolver';

function buildSharpTurnScenario(): AppState {
  const base = makeInitialState();
  const steps: Step[] = [
    {
      off: {
        O1: { x: 300, y: 470 },
        O2: { x: 120, y: 420 },
        O3: { x: 470, y: 420 },
        O4: { x: 180, y: 220 },
        O5: { x: 420, y: 220 },
      },
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      off: {
        O1: { x: 300, y: 470 },
        O2: { x: 270, y: 420 },
        O3: { x: 470, y: 420 },
        O4: { x: 180, y: 220 },
        O5: { x: 420, y: 220 },
      },
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      off: {
        O1: { x: 300, y: 470 },
        O2: { x: 270, y: 270 },
        O3: { x: 470, y: 420 },
        O4: { x: 180, y: 220 },
        O5: { x: 420, y: 220 },
      },
      ballCarrier: 'O1',
      annotations: [],
    },
  ];

  return {
    ...base,
    steps,
    defenseInitial: {
      D1: { x: 300, y: 430 },
      D2: { x: 120, y: 460 },
      D3: { x: 470, y: 460 },
      D4: { x: 180, y: 260 },
      D5: { x: 420, y: 260 },
    },
    activeStep: 0,
  } as AppState;
}

function playbackTo(state: AppState, t: number, fps: number = 60): PlaybackFrame {
  let prev = resolveFrameAt(state, 0, { collectDecisions: true });
  expect(prev).not.toBeNull();
  const totalFrames = Math.floor(t * fps);
  for (let f = 1; f <= totalFrames; f++) {
    const frame = resolveFrameAt(state, f / fps, {
      prevFrame: prev ?? undefined,
      collectDecisions: true,
    });
    expect(frame).not.toBeNull();
    prev = frame;
  }
  return prev!;
}

describe('defender playback motion inertia', () => {
  it('amortit un virage brutal au lieu de pivoter instantanement', () => {
    const state = buildSharpTurnScenario();
    const beforeTurn = playbackTo(state, 1);
    const inertial = resolveFrameAt(state, 1 + 2 / 60, {
      prevFrame: beforeTurn,
      collectDecisions: true,
    });
    const raw = resolveFrameAt(state, 1 + 2 / 60, {
      collectDecisions: true,
    });
    expect(inertial).not.toBeNull();
    expect(raw).not.toBeNull();

    const prevD2 = beforeTurn.defPos.D2;
    const rawDeltaY = Math.abs(raw!.defPos.D2.y - prevD2.y);
    const inertialDeltaY = Math.abs(inertial!.defPos.D2.y - prevD2.y);

    expect(inertial!.debug?.defenders.D2?.motionInertia ?? 0).toBeGreaterThan(0);
    expect(inertial!.debug?.defenders.D2?.motionTurnDeg ?? 0).toBeGreaterThan(60);
    expect(inertialDeltaY).toBeLessThan(rawDeltaY);
    expect(inertial!.motionMemory?.D2?.velocity).toBeTruthy();
  });

  it("n'applique pas l'inertie sur une frame sans memoire precedente", () => {
    const state = buildSharpTurnScenario();
    const frame = resolveFrameAt(state, 1 + 2 / 60, {
      collectDecisions: true,
    });
    expect(frame).not.toBeNull();
    expect(frame!.debug?.defenders.D2?.motionInertia).toBeUndefined();
    expect(frame!.motionMemory).toBeUndefined();
  });
});
