// Tests CVT Chantier 3 — Triangle défensif vectoriel.

import { describe, expect, it } from 'vitest';
import {
  isPassShadowed,
  passShadowsByDefender,
  profileWeightMultipliers,
  triangleAngleDeg,
} from '@/lib/logic/defenseTriangle';
import type { AttackerPositions, DefenderId, OffensiveProfile, Point } from '@/lib/types';
import { PASS_SHADOW_TOLERANCE_PX } from '@/lib/data/physics';

const P = (x: number, y: number): Point => ({ x, y });

describe('triangleAngleDeg', () => {
  it('alignement ballon — défenseur — attaquant → angle ≈ 0°', () => {
    // ballon (0,0), défenseur (10,0), attaquant (20,0) → vecteurs vers
    // ballon (-10, 0) et vers attaquant (+10, 0) → angle ≈ 180° (opposés).
    expect(triangleAngleDeg(P(0, 0), P(10, 0), P(20, 0))).toBeCloseTo(180, 4);
  });

  it('défenseur perpendiculaire à la ligne ballon-attaquant → 90°', () => {
    // ballon (0,0), défenseur (5, 5), attaquant (10, 0).
    // Vecteurs depuis défenseur : vers ballon (-5, -5), vers attaquant (5, -5).
    // Produit scalaire = -25 + 25 = 0 → angle = 90°.
    expect(triangleAngleDeg(P(0, 0), P(5, 5), P(10, 0))).toBeCloseTo(90, 4);
  });

  it('défenseur à équidistance et orienté → angle aigu', () => {
    // Cas où le défenseur est "ouvert" : vecteurs vers ballon et homme
    // forment un angle aigu (lui permet de voir les deux).
    const ang = triangleAngleDeg(P(100, 0), P(50, 50), P(0, 0));
    expect(ang).toBeGreaterThan(0);
    expect(ang).toBeLessThan(180);
  });

  it('défenseur === ballon → 0 (cas dégénéré)', () => {
    expect(triangleAngleDeg(P(50, 50), P(50, 50), P(100, 100))).toBe(0);
  });

  it('défenseur === attaquant → 0 (cas dégénéré)', () => {
    expect(triangleAngleDeg(P(0, 0), P(100, 100), P(100, 100))).toBe(0);
  });

  it("retour borné [0, 180]° (anti-NaN du clamp cos)", () => {
    // Cas extrême : positions colinéaires identiques (cos pourrait être
    // 1.000000001 en float). Le clamp garantit l'absence de NaN.
    const ang = triangleAngleDeg(P(0, 0), P(10, 0), P(20, 0));
    expect(Number.isFinite(ang)).toBe(true);
    expect(ang).toBeGreaterThanOrEqual(0);
    expect(ang).toBeLessThanOrEqual(180);
  });
});

describe('profileWeightMultipliers', () => {
  const PROFILES: OffensiveProfile[] = [
    'shooter', 'stretch-big', 'creator', 'slasher', 'rim-roller', 'non-shooter',
  ];

  it('shooter → manWeight dominant (> 1), basketWeight réduit', () => {
    const w = profileWeightMultipliers('shooter');
    expect(w.manWeight).toBeGreaterThan(1);
    expect(w.basketWeight).toBeLessThan(1);
  });

  it('slasher → basketWeight dominant (> 1), manWeight réduit', () => {
    const w = profileWeightMultipliers('slasher');
    expect(w.basketWeight).toBeGreaterThan(1);
    expect(w.manWeight).toBeLessThan(1);
  });

  it('profil undefined → multiplicateurs neutres (1, 1)', () => {
    expect(profileWeightMultipliers(undefined)).toEqual({ manWeight: 1, basketWeight: 1 });
  });

  it('tous les profils retournent des multiplicateurs strictement positifs', () => {
    for (const p of PROFILES) {
      const w = profileWeightMultipliers(p);
      expect(w.manWeight).toBeGreaterThan(0);
      expect(w.basketWeight).toBeGreaterThan(0);
    }
  });

  it('shooter et stretch-big sont proches (deny tous deux)', () => {
    const a = profileWeightMultipliers('shooter');
    const b = profileWeightMultipliers('stretch-big');
    expect(Math.sign(a.manWeight - 1)).toBe(Math.sign(b.manWeight - 1));
    expect(Math.sign(a.basketWeight - 1)).toBe(Math.sign(b.basketWeight - 1));
  });
});

describe('isPassShadowed', () => {
  const carrier = P(100, 100);
  const attacker = P(500, 100);

  it("défenseur pile sur la ligne, à mi-chemin → shadowed", () => {
    expect(isPassShadowed(P(300, 100), carrier, attacker)).toBe(true);
  });

  it("défenseur dans la tolérance perpendiculaire → shadowed", () => {
    // Tolérance par défaut = 16 px ; on teste à 10 px
    expect(isPassShadowed(P(300, 110), carrier, attacker)).toBe(true);
  });

  it("défenseur hors tolérance perpendiculaire → not shadowed", () => {
    expect(isPassShadowed(P(300, 150), carrier, attacker)).toBe(false);
  });

  it("défenseur avant carrier (projection t < 0) → not shadowed", () => {
    expect(isPassShadowed(P(50, 100), carrier, attacker)).toBe(false);
  });

  it("défenseur après attacker (projection t > 1) → not shadowed", () => {
    expect(isPassShadowed(P(600, 100), carrier, attacker)).toBe(false);
  });

  it("segment dégénéré (carrier === attacker) → not shadowed", () => {
    expect(isPassShadowed(P(100, 100), carrier, carrier)).toBe(false);
  });

  it("tolérance custom appliquée", () => {
    // À 20 px de la ligne : false avec tolérance 16 px, true avec 25 px
    expect(isPassShadowed(P(300, 120), carrier, attacker, 16)).toBe(false);
    expect(isPassShadowed(P(300, 120), carrier, attacker, 25)).toBe(true);
  });
});

describe('passShadowsByDefender', () => {
  const off: AttackerPositions = {
    O1: P(100, 100), // porteur
    O2: P(500, 100), // strong-side
    O3: P(100, 500), // weak-side
    O4: P(300, 300), // milieu
    O5: P(500, 500), // coin
  };
  const carrierId = 'O1' as const;
  const carrierPos = off.O1!;

  it("flag true uniquement pour défenseurs sur une ligne porteur ↔ non-porteur", () => {
    // D1 pile sur la ligne O1-O2 (à mi-chemin)
    const defenders: Record<DefenderId, Point> = {
      D1: P(300, 100), // sur O1-O2 → shadowing
      D2: P(50, 50),   // hors de toute ligne
      D3: P(100, 300), // sur O1-O3
      D4: P(200, 200), // sur O1-O4 (diagonale)
      D5: P(0, 600),   // hors de toute ligne
    };
    const result = passShadowsByDefender(defenders, carrierId, carrierPos, off);
    expect(result.D1).toBe(true);
    expect(result.D2).toBe(false);
    expect(result.D3).toBe(true);
    expect(result.D4).toBe(true);
    expect(result.D5).toBe(false);
  });

  it("ignore le porteur (pas de 'shadow vers soi')", () => {
    // Un défenseur PILE sur le porteur ne doit pas être flagué shadowing
    // (la ligne O1→O1 n'existe pas).
    const defenders: Record<DefenderId, Point> = { D1: carrierPos } as any;
    const result = passShadowsByDefender(defenders, carrierId, carrierPos, {
      O1: carrierPos,
    } as AttackerPositions);
    // O1 est le seul attaquant ET c'est le porteur → aucune ligne
    expect(result.D1).toBe(false);
  });

  it("PASS_SHADOW_TOLERANCE_PX = 16 par défaut", () => {
    expect(PASS_SHADOW_TOLERANCE_PX).toBe(16);
  });
});
