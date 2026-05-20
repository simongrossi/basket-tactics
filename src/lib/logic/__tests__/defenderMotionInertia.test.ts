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
    // L'inertie doit retenir le défenseur dans sa direction d'origine (+X),
    // donc son X final avec inertie doit être supérieur au X sans inertie (qui vire plus abruptement à gauche).
    expect(inertial!.defPos.D2.x).toBeGreaterThan(raw!.defPos.D2.x);

    expect(inertial!.debug?.defenders.D2?.motionInertia ?? 0).toBeGreaterThan(0);
    expect(inertial!.debug?.defenders.D2?.motionTurnDeg ?? 0).toBeGreaterThan(60);
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

  it('module l inertie selon la vitesse max du defenseur', () => {
    const fast = buildSharpTurnScenario();
    fast.rules.D2 = { ...fast.rules.D2, maxSpeed: 145 };
    const slow = buildSharpTurnScenario();
    slow.rules.D2 = { ...slow.rules.D2, maxSpeed: 75 };

    const fastBeforeTurn = playbackTo(fast, 1);
    const slowBeforeTurn = playbackTo(slow, 1);
    const fastFrame = resolveFrameAt(fast, 1 + 2 / 60, {
      prevFrame: fastBeforeTurn,
      collectDecisions: true,
    });
    const slowFrame = resolveFrameAt(slow, 1 + 2 / 60, {
      prevFrame: slowBeforeTurn,
      collectDecisions: true,
    });
    expect(fastFrame).not.toBeNull();
    expect(slowFrame).not.toBeNull();

    const fastInertia = fastFrame!.debug?.defenders.D2?.motionInertia ?? 0;
    const slowInertia = slowFrame!.debug?.defenders.D2?.motionInertia ?? 0;
    expect(slowInertia).toBeGreaterThan(fastInertia + 0.02);
  });
});
