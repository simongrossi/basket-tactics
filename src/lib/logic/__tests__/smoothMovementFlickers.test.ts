import { describe, expect, it } from 'vitest';
import type { AttackerPositions, Step } from '@/lib/types';
import { detectFlicker, type FrameSnapshot } from '../anomaly/anomalyDetector';
import { smoothMovementFlickers } from '../smoothMovementFlickers';

const baseOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

function step(o2: { x: number; y: number }): Step {
  return {
    off: { ...baseOff, O2: o2 },
    ballCarrier: 'O1',
    annotations: [],
  };
}

function snapshot(s: Step, stepIdx: number): FrameSnapshot {
  return {
    off: s.off,
    defPos: {},
    stepIdx,
  } as FrameSnapshot;
}

describe('smoothMovementFlickers', () => {
  it('insere une tenue cachee sur un pivot offensif immediat', () => {
    const out = smoothMovementFlickers([
      step({ x: 100, y: 100 }),
      step({ x: 160, y: 100 }),
      step({ x: 100, y: 100 }),
    ]);

    expect(out).toHaveLength(4);
    expect(out[2].isInterpolated).toBe(true);
    expect(out[2].off.O2).toEqual({ x: 160, y: 100 });

    const flickers = [];
    for (let i = 2; i < out.length; i += 1) {
      flickers.push(
        ...detectFlicker(
          snapshot(out[i - 2], i - 2),
          snapshot(out[i - 1], i - 1),
          snapshot(out[i], i),
        ).filter((report) => report.playerId === 'O2'),
      );
    }
    expect(flickers).toEqual([]);
  });
});
