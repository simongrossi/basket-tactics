// Tests D.3 — Variantes de trajectoire de passe (computeBallFrame).

import { describe, expect, it } from 'vitest';
import { computeBallFrame } from '@/lib/logic/geometry';

describe('D.3 — computeBallFrame passKind', () => {
  const prev = { x: 100, y: 400 };
  const next = { x: 500, y: 400 };

  it('extrémités exactes pour tous les passKind (t=0 → prev+offset, t=1 → next+offset)', () => {
    const kinds = ['direct', 'lob', 'bounce', 'skip'] as const;
    for (const kind of kinds) {
      const startFrame = computeBallFrame(prev, next, true, 0, kind);
      const endFrame = computeBallFrame(prev, next, true, 1, kind);
      // Offset du ballon par rapport au porteur : +16 / -16.
      expect(startFrame.pos.x).toBeCloseTo(prev.x + 16, 3);
      expect(startFrame.pos.y).toBeCloseTo(prev.y - 16, 3);
      expect(endFrame.pos.x).toBeCloseTo(next.x + 16, 3);
      expect(endFrame.pos.y).toBeCloseTo(next.y - 16, 3);
    }
  });

  it("'lob' monte plus haut que 'direct' au milieu de la trajectoire", () => {
    const directMid = computeBallFrame(prev, next, true, 0.5, 'direct');
    const lobMid = computeBallFrame(prev, next, true, 0.5, 'lob');
    // SVG Y vers le bas → "monter" = y plus petit. Lob est au-dessus de direct.
    expect(lobMid.pos.y).toBeLessThan(directMid.pos.y);
  });

  it("'skip' monte moins haut que 'direct'", () => {
    const directMid = computeBallFrame(prev, next, true, 0.5, 'direct');
    const skipMid = computeBallFrame(prev, next, true, 0.5, 'skip');
    // Skip plus plat → y plus grand (plus proche du sol).
    expect(skipMid.pos.y).toBeGreaterThan(directMid.pos.y);
  });

  it("'bounce' touche le sol au milieu (y ≈ niveau du sol)", () => {
    const baselineY = (prev.y + next.y) / 2 - 16; // niveau de la ligne porteurs - offset.
    const bounceMid = computeBallFrame(prev, next, true, 0.5, 'bounce');
    // Le rebound passe par y ≈ ligne porteurs (lift = 0 à t=0.5 dans le pattern bounce).
    expect(bounceMid.pos.y).toBeCloseTo(baselineY, 1);
  });

  it("'bounce' a un pic d'arc à t=0.25 et t=0.75 (les deux apex)", () => {
    const baseline = (prev.y + next.y) / 2 - 16;
    const apex1 = computeBallFrame(prev, next, true, 0.25, 'bounce');
    const apex2 = computeBallFrame(prev, next, true, 0.75, 'bounce');
    // Les deux apex doivent être plus hauts que la baseline (y < baseline).
    expect(apex1.pos.y).toBeLessThan(baseline);
    expect(apex2.pos.y).toBeLessThan(baseline);
  });

  it("default (passKind undefined) = 'direct' (rétrocompat)", () => {
    const noKind = computeBallFrame(prev, next, true, 0.5);
    const directMid = computeBallFrame(prev, next, true, 0.5, 'direct');
    expect(noKind.pos.x).toBeCloseTo(directMid.pos.x, 5);
    expect(noKind.pos.y).toBeCloseTo(directMid.pos.y, 5);
  });

  it('carrierChanged=false ignore passKind (porteur unique, pas de vol)', () => {
    const result = computeBallFrame(prev, next, false, 0.5, 'lob');
    expect(result.inFlight).toBe(false);
    // Trajectoire linéaire de la main du porteur, peu importe le kind.
    expect(result.pos.x).toBeCloseTo((prev.x + next.x) / 2 + 16, 3);
    expect(result.pos.y).toBeCloseTo((prev.y + next.y) / 2 - 16, 3);
  });
});
