import { describe, it, expect } from 'vitest';

// Reproduction locale du helper (non exporté) pour test en isolation.
function screenContactT(
  localT: number,
  quality: number,
  mode: 'arriving' | 'leaving' | 'stuck' | null
): number {
  if (!mode) return localT;
  const q = Math.max(0, Math.min(100, quality)) / 100;
  const k = 1 + q * 12;
  const center = mode === 'arriving'
    ? 0.5 - q * 0.30
    : mode === 'leaving'
      ? 0.5 + q * 0.30
      : 0.5;
  const sig = (t: number) => 1 / (1 + Math.exp(-k * (t - center)));
  const s0 = sig(0);
  const s1 = sig(1);
  const denom = s1 - s0;
  if (denom < 1e-9) return localT;
  return (sig(localT) - s0) / denom;
}

describe('screenContactT — freeze sigmoïdal sur l\'écran', () => {
  it('quality 0 reste quasi-linéaire (ghost)', () => {
    // Avec k=1 et center=0.5, la sigmoïde est presque linéaire en [0,1].
    expect(screenContactT(0.5, 0, 'arriving')).toBeCloseTo(0.5, 1);
    expect(screenContactT(0.5, 0, 'leaving')).toBeCloseTo(0.5, 1);
  });

  it('continuité aux extrémités : f(0)=0, f(1)=1 pour tous les modes/qualités', () => {
    [0, 25, 50, 75, 100].forEach((q) => {
      (['arriving', 'leaving', 'stuck'] as const).forEach((mode) => {
        expect(screenContactT(0, q, mode)).toBeCloseTo(0);
        expect(screenContactT(1, q, mode)).toBeCloseTo(1);
      });
    });
  });

  describe('arriving — D1 atteint defB tôt puis plateau', () => {
    it('quality 100 : effT atteint ≥0.85 à localT=0.5', () => {
      const v = screenContactT(0.5, 100, 'arriving');
      expect(v).toBeGreaterThan(0.85);
    });
    it('quality 100 : plateau dans la seconde moitié (effT≥0.95 à 0.7)', () => {
      const v = screenContactT(0.7, 100, 'arriving');
      expect(v).toBeGreaterThan(0.95);
    });
    it('monotonie : plus haut quality = effT plus avancé à localT=0.4', () => {
      const v0 = screenContactT(0.4, 0, 'arriving');
      const v50 = screenContactT(0.4, 50, 'arriving');
      const v100 = screenContactT(0.4, 100, 'arriving');
      expect(v50).toBeGreaterThan(v0);
      expect(v100).toBeGreaterThan(v50);
    });
  });

  describe('leaving — D1 figé puis rattrape tard', () => {
    it('quality 100 : effT reste ≤0.15 à localT=0.5', () => {
      const v = screenContactT(0.5, 100, 'leaving');
      expect(v).toBeLessThan(0.15);
    });
    it('quality 100 : effT toujours < 0.5 à localT=0.7', () => {
      const v = screenContactT(0.7, 100, 'leaving');
      expect(v).toBeLessThan(0.5);
    });
    it('monotonie : plus haut quality = effT plus retardé à localT=0.6', () => {
      const v0 = screenContactT(0.6, 0, 'leaving');
      const v50 = screenContactT(0.6, 50, 'leaving');
      const v100 = screenContactT(0.6, 100, 'leaving');
      expect(v50).toBeLessThan(v0);
      expect(v100).toBeLessThan(v50);
    });
  });

  describe('lissage (pas de discontinuité de dérivée)', () => {
    it("la dérivée numérique reste bornée — pas de saut", () => {
      // Approximation : la différence entre deux points proches reste petite.
      const q = 100;
      const step = 0.01;
      for (const mode of ['arriving', 'leaving'] as const) {
        for (let t = 0; t < 1; t += 0.05) {
          const v1 = screenContactT(t, q, mode);
          const v2 = screenContactT(t + step, q, mode);
          const derivative = Math.abs(v2 - v1) / step;
          // Avec une sigmoïde k=13, la dérivée max est k/4 ≈ 3.25
          // (vs piecewise qui pouvait sauter de 0 à 1/(0.45) ≈ 2.2 brutalement).
          // La sigmoïde garantit une transition douce.
          expect(derivative).toBeLessThan(5);
        }
      }
    });
  });
});
