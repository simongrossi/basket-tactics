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

  it('sampled point at the first interior knot matches the rendered path direction', () => {
    // For from=(0,0), to=(100,0): len=100, segs = max(4, round(100/14)) = 7.
    // Knot at idx=1 (t=1/7): sign = 1%2===0 ? 1 : -1 = -1.
    // For a horizontal segment, perpendicular is +y, so y at this knot = -5.
    const segs = 7;
    const t = 1 / segs;
    const p = sampleDribbleWave({ x: 0, y: 0 }, { x: 100, y: 0 }, t);
    expect(p.x).toBeCloseTo(100 / segs, 5);
    expect(p.y).toBeCloseTo(-5, 5);
  });

  it('sampled point at the second interior knot has opposite sign', () => {
    // Knot at idx=2: sign = 2%2===0 ? 1 : -1 = +1 → y = +5.
    const segs = 7;
    const t = 2 / segs;
    const p = sampleDribbleWave({ x: 0, y: 0 }, { x: 100, y: 0 }, t);
    expect(p.y).toBeCloseTo(5, 5);
  });

  it('sampled point between knots is the linear interpolation of the two knot offsets', () => {
    // Mid-segment between knot 3 (sign=-1, y=-5) and knot 4 (sign=+1, y=+5) at t=0.5.
    // segs=7, t=0.5 → seg = 3.5, subT=0.5, y = lerp(-5, +5, 0.5) = 0.
    const p = sampleDribbleWave({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(p.y).toBeCloseTo(0, 5);
  });
});

describe('dribbleWavePath', () => {
  it('produces a valid SVG path string starting at from and ending at to', () => {
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toMatch(/^M 0 0/);
    expect(d).toMatch(/L 100 0$/);
  });

  it('interior knots alternate sign with amplitude 5 (horizontal segment, segs=7)', () => {
    // For from=(0,0), to=(100,0): len=100, segs = max(4, round(100/14)) = 7.
    // Interior knots are at idx=1..6. Sign convention: idx%2===0 ? 1 : -1.
    // Normal vector for horizontal segment is (0, 1), so y = sign * AMPLITUDE = ±5.
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    // Parse all "L x y" tokens after the initial "M".
    const tokens = d.match(/L (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g) ?? [];
    expect(tokens).toHaveLength(7); // 6 interior + final
    const ys = tokens.map((t) => Number(t.split(' ')[2]));
    // Interior 6 knots, then final at y=0.
    const expected = [-5, 5, -5, 5, -5, 5, 0];
    ys.forEach((y, i) => expect(y).toBeCloseTo(expected[i], 5));
  });
});
