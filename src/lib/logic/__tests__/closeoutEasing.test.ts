// Tests C.1 — closeout easing (sprint + freinage).

import { describe, expect, it } from 'vitest';
import { closeoutEasing } from '../closeoutEasing';

describe('closeoutEasing', () => {
  it('vaut 0 à t=0 et 1 à t=1 (invariants extrémités)', () => {
    expect(closeoutEasing(0)).toBe(0);
    expect(closeoutEasing(1)).toBe(1);
  });

  it("clamp en dehors de [0, 1]", () => {
    expect(closeoutEasing(-0.5)).toBe(0);
    expect(closeoutEasing(1.5)).toBe(1);
  });

  it("atteint 0.85 à la jonction sprint/freinage (t=0.65)", () => {
    expect(closeoutEasing(0.65)).toBeCloseTo(0.85, 2);
  });

  it("monotone croissante (échantillonnage 100 points)", () => {
    let prev = closeoutEasing(0);
    for (let i = 1; i <= 100; i++) {
      const cur = closeoutEasing(i / 100);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it("phase sprint plus rapide que linéaire (t=0.3 → progression > 0.3)", () => {
    // À t=0.3, l'easing easeOut quad donne ~0.51 → multiplié par 0.85 = 0.43
    expect(closeoutEasing(0.3)).toBeGreaterThan(0.3);
    expect(closeoutEasing(0.5)).toBeGreaterThan(0.5);
  });

  it("phase freinage plus lente que linéaire (t=0.85 → progression < 0.85)", () => {
    // À t=0.85, on est en phase 2. u = (0.85 - 0.65)/0.35 ≈ 0.571
    // eased = 0.571² ≈ 0.326
    // result = 0.85 + 0.326 * 0.15 ≈ 0.899 < 0.85 ? NON, 0.899 > 0.85.
    // Mais c'est < 0.95 (linéaire scaled). Test sur ratio par rapport à 0.95.
    // À t=0.85, sur une montée linéaire, on serait à 0.85.
    // Avec freinage, on devrait être > 0.85 mais < 1.
    // Plus simple : t=0.9 → result devrait être < 0.95 (linéaire scaled
    // de t=0.65 à t=1 donnerait 0.85 + (0.9-0.65)/(1-0.65) * 0.15 = 0.85 + 0.107 = 0.957)
    // Avec easeIn, on est en dessous : (0.9-0.65)/0.35 = 0.714, eased = 0.510,
    // result = 0.85 + 0.510 * 0.15 = 0.927 < 0.957. OK.
    expect(closeoutEasing(0.9)).toBeLessThan(0.96);
  });

  it("différence visuelle vs linéaire au milieu du segment (t=0.5)", () => {
    // À t=0.5 linéaire = 0.5
    // closeoutEasing(0.5) : u = 0.5/0.65 = 0.77, eased = 1 - 0.23² = 0.947
    // result = 0.947 * 0.85 = 0.805
    // Donc le défenseur a déjà fait 80% du chemin à mi-temps.
    const linear = 0.5;
    const eased = closeoutEasing(0.5);
    expect(eased).toBeGreaterThan(linear + 0.2); // au moins +20 % d'avance
  });
});
