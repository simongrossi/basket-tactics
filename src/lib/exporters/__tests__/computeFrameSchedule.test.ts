import { describe, it, expect } from 'vitest';
import { computeFrameSchedule } from '../computeFrameSchedule';

describe('computeFrameSchedule', () => {
  it('totalSeconds > 0, lastStepIdx > 0 — frameCount et dt cohérents', () => {
    const s = computeFrameSchedule({ totalSeconds: 4, lastStepIdx: 2, fps: 30 });
    expect(s.frameCount).toBe(120);
    // dt = lastStepIdx / (frameCount - 1) = 2 / 119
    expect(s.dt).toBeCloseTo(2 / 119, 6);
  });

  it("totalSeconds === 0 — au moins 1 frame, dt = 0", () => {
    const s = computeFrameSchedule({ totalSeconds: 0, lastStepIdx: 0, fps: 30 });
    expect(s.frameCount).toBe(1);
    expect(s.dt).toBe(0);
  });

  it("lastStepIdx === 0 (un seul step) — dt = 0 quelle que soit la durée", () => {
    const s = computeFrameSchedule({ totalSeconds: 2, lastStepIdx: 0, fps: 30 });
    expect(s.frameCount).toBe(60);
    expect(s.dt).toBe(0);
  });

  it("fps élevé arrondit le nombre de frames vers le haut", () => {
    const s = computeFrameSchedule({ totalSeconds: 1.1, lastStepIdx: 1, fps: 30 });
    expect(s.frameCount).toBe(33); // ceil(33)
  });

  it("totalSeconds < 0 clampé à 0 — au moins 1 frame", () => {
    const s = computeFrameSchedule({ totalSeconds: -1, lastStepIdx: 1, fps: 30 });
    expect(s.frameCount).toBe(1);
  });
});
