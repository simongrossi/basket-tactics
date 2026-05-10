import { describe, it, expect } from 'vitest';
import { screenPenaltyFromQuality } from '../defense/speedConstraint';

describe('screenPenaltyFromQuality — Étape 12', () => {
  it('quality 0 (ghost) → 1.0 (pas de ralentissement)', () => {
    expect(screenPenaltyFromQuality(0)).toBeCloseTo(1.0, 3);
  });

  it('quality 50 (standard, défaut Étape 11) → 0.55', () => {
    expect(screenPenaltyFromQuality(50)).toBeCloseTo(0.55, 3);
  });

  it('quality 100 (lockdown) → 0.18', () => {
    expect(screenPenaltyFromQuality(100)).toBeCloseTo(0.18, 3);
  });

  it('quality 25 (loose) → entre 0.55 et 1.0', () => {
    const p = screenPenaltyFromQuality(25);
    expect(p).toBeGreaterThan(0.55);
    expect(p).toBeLessThan(1.0);
    expect(p).toBeCloseTo(0.775, 3);
  });

  it('quality 75 (solid) → entre 0.18 et 0.55', () => {
    const p = screenPenaltyFromQuality(75);
    expect(p).toBeGreaterThan(0.18);
    expect(p).toBeLessThan(0.55);
    expect(p).toBeCloseTo(0.365, 3);
  });

  it('monotonie : plus la qualité monte, plus la pénalité descend', () => {
    const values = [0, 10, 25, 50, 75, 90, 100].map(screenPenaltyFromQuality);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('clamp : valeurs hors [0,100] sont bornées', () => {
    expect(screenPenaltyFromQuality(-50)).toBeCloseTo(1.0, 3);
    expect(screenPenaltyFromQuality(200)).toBeCloseTo(0.18, 3);
  });
});
