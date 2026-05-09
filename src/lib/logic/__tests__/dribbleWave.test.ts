import { describe, it, expect } from 'vitest';
import { sampleDribbleWave, dribbleWavePath } from '../dribbleWave';

describe('sampleDribbleWave', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };

  it('starts at from when t=0', () => {
    expect(sampleDribbleWave(from, to, 0)).toEqual({ x: 0, y: 0 });
  });

  it('ends at to when t=1', () => {
    expect(sampleDribbleWave(from, to, 1)).toEqual({ x: 100, y: 0 });
  });

  it('progresses along the segment axis', () => {
    const p = sampleDribbleWave(from, to, 0.5);
    expect(p.x).toBeCloseTo(50, 0);
  });

  it('introduces a lateral wave (offset perpendiculaire non nul autour de t=0.25)', () => {
    const p = sampleDribbleWave(from, to, 0.25);
    expect(Math.abs(p.y)).toBeGreaterThan(0);
  });

  it('vertical segment : oscillation latérale en x', () => {
    const p = sampleDribbleWave({ x: 0, y: 0 }, { x: 0, y: 100 }, 0.25);
    expect(Math.abs(p.x)).toBeGreaterThan(0);
  });
});

describe('dribbleWavePath', () => {
  it('produces a valid SVG path string starting at from and ending at to', () => {
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toMatch(/^M 0 0/);
    expect(d).toMatch(/L 100 0$/);
  });
});
