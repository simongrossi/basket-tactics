import { describe, it, expect } from 'vitest';
import { buildVelocityProfile } from '../velocityProfile';

describe('buildVelocityProfile', () => {
  it('path à 2 points → remap identité', () => {
    const p = buildVelocityProfile([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(p.remap(0)).toBeCloseTo(0, 6);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('path droit à 3 points (collinéaires) → remap identité', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.25)).toBeCloseTo(0.25, 3);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 3);
    expect(p.remap(0.75)).toBeCloseTo(0.75, 3);
  });

  it("path en V symétrique → à actionT=0.25, s/L > 0.25 (avance en zone rapide)", () => {
    // Apex à (50, 80) entre (0,0) et (100,0) — V symétrique.
    // En zone rapide (avant l'apex), le joueur couvre plus d'arc par
    // unité de temps qu'en moyenne.
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.25)).toBeGreaterThan(0.25 + 0.02);
  });

  it('path en V symétrique → remap(0.5) ≈ 0.5 par symétrie', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 2);
  });

  it('endpoints invariants : remap(0) === 0, remap(1) === 1', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    expect(p.remap(0)).toBe(0);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('monotonie : 10 valeurs croissantes → s/L strictement croissant', () => {
    const p = buildVelocityProfile([
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ]);
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const s = p.remap(i / 10);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('tier elite vs lent : elite dévie moins de l\'identité que lent', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ];
    const elite = buildVelocityProfile(path, { tier: 'elite' });
    const lent = buildVelocityProfile(path, { tier: 'lent' });
    // À actionT=0.25, la déviation par rapport à 0.25 est plus grande
    // pour lent (qui ralentit plus en virage).
    const deltaElite = Math.abs(elite.remap(0.25) - 0.25);
    const deltaLent = Math.abs(lent.remap(0.25) - 0.25);
    expect(deltaLent).toBeGreaterThan(deltaElite);
  });

  it('path dégénéré (from === to) → remap identité, length 0', () => {
    const p = buildVelocityProfile([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(p.length).toBe(0);
    expect(p.remap(0)).toBeCloseTo(0, 6);
    expect(p.remap(0.5)).toBeCloseTo(0.5, 6);
    expect(p.remap(1)).toBeCloseTo(1, 6);
  });

  it('path à 1 point ou vide → remap identité', () => {
    const p1 = buildVelocityProfile([{ x: 5, y: 5 }]);
    expect(p1.length).toBe(0);
    expect(p1.remap(0.7)).toBeCloseTo(0.7, 6);
    const p0 = buildVelocityProfile([]);
    expect(p0.length).toBe(0);
    expect(p0.remap(0.3)).toBeCloseTo(0.3, 6);
  });
});
