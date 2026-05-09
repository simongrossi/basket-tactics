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

  it('progresses along the segment axis (x ≈ 50 au milieu)', () => {
    const p = sampleDribbleWave(from, to, 0.5);
    expect(p.x).toBeCloseTo(50, 0);
  });

  it('introduit une oscillation latérale (offset perpendiculaire non nul autour de t=0.25)', () => {
    const p = sampleDribbleWave(from, to, 0.25);
    expect(Math.abs(p.y)).toBeGreaterThan(0);
  });

  it('segment vertical : oscillation latérale en x', () => {
    const p = sampleDribbleWave({ x: 0, y: 0 }, { x: 0, y: 100 }, 0.25);
    expect(Math.abs(p.x)).toBeGreaterThan(0);
  });

  it("amplitude visuelle de la wave bornée à AMPLITUDE/2 (pic Bezier ±10 → sommet ±5)", () => {
    let maxAbs = 0;
    for (let i = 1; i < 20; i++) {
      const p = sampleDribbleWave(from, to, i / 20);
      maxAbs = Math.max(maxAbs, Math.abs(p.y));
    }
    expect(maxAbs).toBeGreaterThan(2);
    expect(maxAbs).toBeLessThanOrEqual(5 + 0.01);
  });

  it("alternance de signes : la wave change de côté au moins une fois", () => {
    let prevSign = 0;
    let crossings = 0;
    for (let i = 1; i < 30; i++) {
      const p = sampleDribbleWave(from, to, i / 30);
      const s = Math.sign(p.y);
      if (s !== 0 && prevSign !== 0 && s !== prevSign) crossings++;
      if (s !== 0) prevSign = s;
    }
    expect(crossings).toBeGreaterThanOrEqual(1);
  });
});

describe('dribbleWavePath', () => {
  it('produit un path SVG valide commençant à `from` et finissant à `to`', () => {
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toMatch(/^M 0 0/);
    // Dernière instruction Q : `... Q px py 100 0`
    expect(d).toMatch(/Q [^Q]+ 100 0$/);
  });

  it("utilise des courbes quadratiques (Q), pas une polyligne en dents de scie", () => {
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toContain('Q');
    // Pas de `L` (polyligne) — uniquement M + Q chainés.
    expect(d).not.toContain('L');
  });

  it("nombre de Q = segs - 1 (segment horizontal de 100 px → segs=7 → 6 Q)", () => {
    const d = dribbleWavePath({ x: 0, y: 0 }, { x: 100, y: 0 });
    const qTokens = d.match(/Q /g) ?? [];
    expect(qTokens).toHaveLength(6);
  });
});
