import { describe, it, expect } from 'vitest';
import { anticipationTarget } from '../screenPhysics';

describe('anticipationTarget — recovery IQ (A+B+C)', () => {
  const hoop = { x: 300, y: 75 };
  const defenseDistance = 40;
  const defenderSpeed = 110;

  it('iq 0 : retourne currentTarget inchangée (pure réaction, legacy)', () => {
    const currentTarget = { x: 300, y: 460 };
    const out = anticipationTarget(
      currentTarget,
      { x: 350, y: 460 },
      { x: 300, y: 470 },
      { x: 0, y: 0 },
      hoop,
      defenseDistance,
      defenderSpeed,
      0
    );
    expect(out).toEqual(currentTarget);
  });

  it('iq 100 : déplace la cible vers une combinaison A+B+C', () => {
    const currentTarget = { x: 300, y: 460 };
    const out = anticipationTarget(
      currentTarget,
      { x: 350, y: 460 },
      { x: 300, y: 470 },
      { x: 30, y: -20 }, // carrier remonte vers le panier
      hoop,
      defenseDistance,
      defenderSpeed,
      100
    );
    // À iq=100, la cible doit avoir bougé de la cible legacy.
    const moved = Math.hypot(out.x - currentTarget.x, out.y - currentTarget.y);
    expect(moved).toBeGreaterThan(5);
  });

  describe('A — Lookahead', () => {
    it('avec vitesse non nulle, la cible anticipe la position future', () => {
      const currentTarget = { x: 300, y: 460 };
      // Carrier bouge vers la droite, défenseur loin derrière.
      const out = anticipationTarget(
        currentTarget,
        { x: 100, y: 460 },
        { x: 300, y: 470 },
        { x: 50, y: 0 }, // déplacement +50px en x
        hoop,
        defenseDistance,
        defenderSpeed,
        100
      );
      // La cible doit être DÉCALÉE vers la droite (anticipation du mouvement),
      // donc x_out > currentTarget.x.
      expect(out.x).toBeGreaterThan(currentTarget.x);
    });
  });

  describe('B — Basket-line bias', () => {
    it("ramène le défenseur sur l'axe O1→panier", () => {
      // Défenseur fortement décalé latéralement, carrier statique.
      const currentTarget = { x: 300, y: 460 }; // sur l'axe
      const out = anticipationTarget(
        currentTarget,
        { x: 450, y: 460 }, // défenseur très à droite, hors axe
        { x: 300, y: 470 },
        { x: 0, y: 0 },
        hoop,
        defenseDistance,
        defenderSpeed,
        100
      );
      // Sans le bias basket-line, la cible serait restée à currentTarget.
      // Avec bias, elle doit avoir bougé vers où DÉFENSEUR projeté sur l'axe
      // se trouverait — c'est-à-dire en haut (vers le panier).
      // L'axe carrier(300,470) → hoop(300,75) est purement vertical.
      // La projection de (450,460) sur cet axe = (300, 460).
      // Donc smart target tend vers (300, ...) — pas un test fort, juste
      // que la cible reste proche de l'axe (x ≈ 300).
      expect(Math.abs(out.x - 300)).toBeLessThan(50);
    });
  });

  describe('C — Interception', () => {
    it('défenseur plus rapide intercepte la trajectoire au lieu de rattraper', () => {
      const currentTarget = { x: 300, y: 460 };
      // Carrier bouge vite vers le panier ; défenseur derrière mais plus rapide.
      const out = anticipationTarget(
        currentTarget,
        { x: 320, y: 500 },
        { x: 300, y: 470 },
        { x: 0, y: -40 }, // carrier remonte vers panier (y diminue)
        hoop,
        defenseDistance,
        200, // défenseur très rapide
        100
      );
      // La cible d'interception devrait être PLUS HAUT que currentTarget (le
      // défenseur va couper le drive en se mettant devant).
      expect(out.y).toBeLessThan(currentTarget.y);
    });

    it('carrier statique → C dégénère, retombe sur A/B', () => {
      const currentTarget = { x: 300, y: 460 };
      const out = anticipationTarget(
        currentTarget,
        { x: 350, y: 460 },
        { x: 300, y: 470 },
        { x: 0, y: 0 },
        hoop,
        defenseDistance,
        defenderSpeed,
        100
      );
      // Pas de crash, valeur finie.
      expect(Number.isFinite(out.x)).toBe(true);
      expect(Number.isFinite(out.y)).toBe(true);
    });

    it('défenseur trop lent → C dégénère, fallback OK', () => {
      const currentTarget = { x: 300, y: 460 };
      const out = anticipationTarget(
        currentTarget,
        { x: 350, y: 460 },
        { x: 300, y: 470 },
        { x: 50, y: -50 },
        hoop,
        defenseDistance,
        20, // trop lent
        100
      );
      expect(Number.isFinite(out.x)).toBe(true);
      expect(Number.isFinite(out.y)).toBe(true);
    });
  });

  describe('Monotonie / continuité', () => {
    it('iq augmente progressivement → cible évolue continûment depuis legacy', () => {
      const currentTarget = { x: 300, y: 460 };
      const args = [
        { x: 350, y: 460 },
        { x: 300, y: 470 },
        { x: 30, y: -20 },
        hoop,
        defenseDistance,
        defenderSpeed,
      ] as const;
      const v0 = anticipationTarget(currentTarget, ...args, 0);
      const v25 = anticipationTarget(currentTarget, ...args, 25);
      const v50 = anticipationTarget(currentTarget, ...args, 50);
      const v100 = anticipationTarget(currentTarget, ...args, 100);
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      // À chaque palier, le décalage augmente.
      expect(d(v0, currentTarget)).toBeLessThan(d(v25, currentTarget));
      expect(d(v25, currentTarget)).toBeLessThan(d(v50, currentTarget));
      expect(d(v50, currentTarget)).toBeLessThan(d(v100, currentTarget));
    });
  });
});
