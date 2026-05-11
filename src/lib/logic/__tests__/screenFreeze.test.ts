import { describe, it, expect } from 'vitest';

// Reproductions locales des helpers (non exportés du frameResolver) pour
// pouvoir les tester en isolation.

function freezeWidthFromQuality(quality: number): number {
  const q = Math.max(0, Math.min(100, quality)) / 100;
  return q * 0.55;
}

function screenContactT(
  localT: number,
  freezeWidth: number,
  mode: 'arriving' | 'leaving' | null
): number {
  if (!mode || freezeWidth <= 0) return localT;
  const w = Math.min(0.9, freezeWidth);
  if (mode === 'arriving') {
    const active = 1 - w;
    return localT < active ? localT / active : 1;
  }
  return localT > w ? (localT - w) / (1 - w) : 0;
}

describe('screenContactT — freeze sur l\'écran', () => {
  describe('quality 0 (ghost) — pas de freeze', () => {
    it('passe localT inchangé pour arriving', () => {
      const w = freezeWidthFromQuality(0);
      expect(screenContactT(0.5, w, 'arriving')).toBeCloseTo(0.5);
    });
    it('passe localT inchangé pour leaving', () => {
      const w = freezeWidthFromQuality(0);
      expect(screenContactT(0.5, w, 'leaving')).toBeCloseTo(0.5);
    });
  });

  describe('quality 100 (lockdown) — freeze maximal', () => {
    const w = freezeWidthFromQuality(100);

    it('arriving : atteint defB à t = 1-w puis y reste', () => {
      // w ≈ 0.55, active = 0.45
      expect(screenContactT(0.1, w, 'arriving')).toBeCloseTo(0.1 / 0.45);
      expect(screenContactT(0.5, w, 'arriving')).toBe(1);
      expect(screenContactT(0.9, w, 'arriving')).toBe(1);
      expect(screenContactT(1.0, w, 'arriving')).toBe(1);
    });

    it('leaving : reste à 0 pendant [0, w] puis rattrape', () => {
      expect(screenContactT(0.2, w, 'leaving')).toBe(0);
      expect(screenContactT(0.5, w, 'leaving')).toBe(0);
      // À t=0.55+, le mapping reprend (0.55→0, 1→1)
      expect(screenContactT(0.6, w, 'leaving')).toBeCloseTo((0.6 - 0.55) / 0.45);
      expect(screenContactT(1.0, w, 'leaving')).toBeCloseTo(1);
    });
  });

  describe('quality 50 (std) — freeze modéré', () => {
    const w = freezeWidthFromQuality(50); // 0.275

    it('arriving : freeze dans les derniers 27% de la transition', () => {
      // active = 0.725
      const tFreeze = 1 - w; // 0.725
      expect(screenContactT(tFreeze - 0.01, w, 'arriving')).toBeLessThan(1);
      expect(screenContactT(tFreeze + 0.01, w, 'arriving')).toBe(1);
    });

    it('plus haut quality = plus large freeze (monotonie)', () => {
      const w25 = freezeWidthFromQuality(25);
      const w75 = freezeWidthFromQuality(75);
      expect(w25).toBeLessThan(w);
      expect(w).toBeLessThan(w75);
    });
  });

  describe('continuité aux extrémités', () => {
    it('t=0 → 0, t=1 → 1 quelle que soit la qualité (arriving)', () => {
      [0, 25, 50, 75, 100].forEach((q) => {
        const w = freezeWidthFromQuality(q);
        expect(screenContactT(0, w, 'arriving')).toBe(0);
        expect(screenContactT(1, w, 'arriving')).toBe(1);
      });
    });
    it('t=0 → 0, t=1 → 1 quelle que soit la qualité (leaving)', () => {
      [0, 25, 50, 75, 100].forEach((q) => {
        const w = freezeWidthFromQuality(q);
        expect(screenContactT(0, w, 'leaving')).toBe(0);
        expect(screenContactT(1, w, 'leaving')).toBeCloseTo(1);
      });
    });
  });
});
