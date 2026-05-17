// Tests D.1 — Easing cross-step.

import { describe, expect, it } from 'vitest';
import { applyEasing, easeLinear, easeInOut, easeOut } from '@/lib/logic/playback/easing';

describe('D.1 — easing functions (pures)', () => {
  it('toutes les fonctions valent 0 à t=0 et 1 à t=1 (invariant snapshots step)', () => {
    for (const fn of [easeLinear, easeInOut, easeOut]) {
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
    }
  });

  it('easeLinear = identité', () => {
    expect(easeLinear(0.25)).toBe(0.25);
    expect(easeLinear(0.5)).toBe(0.5);
    expect(easeLinear(0.75)).toBe(0.75);
  });

  it('easeInOut symétrique autour de 0.5', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    // À 0.25 : ralenti (< 0.25 linéaire). À 0.75 : ralenti aussi (>0.75 linéaire reverse).
    expect(easeInOut(0.25)).toBeLessThan(0.25);
    expect(easeInOut(0.75)).toBeGreaterThan(0.75);
    // Symétrie : e(1-t) + e(t) = 1.
    for (const t of [0.1, 0.3, 0.45]) {
      expect(easeInOut(t) + easeInOut(1 - t)).toBeCloseTo(1, 5);
    }
  });

  it('easeOut démarre rapide (> linéaire) puis ralentit', () => {
    // À t=0.25, on doit avoir dépassé 0.25 linéaire.
    expect(easeOut(0.25)).toBeGreaterThan(0.25);
    // À t=0.5, on est largement au-dessus de 0.5.
    expect(easeOut(0.5)).toBeGreaterThan(0.7);
  });

  it('applyEasing("linear") = identité', () => {
    expect(applyEasing(0.3, 'linear')).toBe(0.3);
  });

  it('applyEasing(undefined) = identité (rétrocompat)', () => {
    expect(applyEasing(0.3, undefined)).toBe(0.3);
  });

  it('applyEasing dispatch correctement vers les variantes', () => {
    expect(applyEasing(0.5, 'ease-in-out')).toBeCloseTo(0.5, 5);
    expect(applyEasing(0.25, 'ease-out')).toBeGreaterThan(0.25);
  });

  it('clamp aux bornes', () => {
    expect(applyEasing(-0.5, 'ease-in-out')).toBe(0);
    expect(applyEasing(1.5, 'ease-out')).toBe(1);
  });
});
