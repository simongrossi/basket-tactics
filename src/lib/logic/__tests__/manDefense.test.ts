import { describe, it, expect } from 'vitest';
import {
  carrierDefenderTarget,
  carrierDefenderTargetForces,
  manTarget,
  manTargetForces,
  offBallStanceTarget,
  offBallStanceTargetForces,
} from '../manDefense';
import { composeTarget } from '../steeringEngine';
import type { CarrierBehavior, OffBallStance, Point } from '../../types';
import { HOOP, HOOP_OPPOSITE } from '../../data/court';

describe('offBallStanceTarget — stunt', () => {
  it("place le défenseur entre son homme et la ligne homme↔ballon (fake d'aide)", () => {
    const att = { x: 470, y: 380 };
    const ball = { x: 300, y: 470 };
    const t = offBallStanceTarget(att, ball, 40, 'stunt');
    expect(t).not.toBeNull();
    // Distance att→target = ~defenseDistance (40), comme les autres stances
    const dAttTarget = Math.hypot(t!.x - att.x, t!.y - att.y);
    expect(dAttTarget).toBeGreaterThan(20);
    expect(dAttTarget).toBeLessThan(50);
  });

  it("le stunt est moins agressif que fronting (plus proche de behind que de fronting)", () => {
    const att = { x: 470, y: 380 };
    const ball = { x: 300, y: 470 };
    const stunt = offBallStanceTarget(att, ball, 40, 'stunt')!;
    const front = offBallStanceTarget(att, ball, 40, 'fronting')!;
    const back = offBallStanceTarget(att, ball, 40, 'sag')!; // = manTarget = behind

    const distToFront = Math.hypot(stunt.x - front.x, stunt.y - front.y);
    const distToBack = Math.hypot(stunt.x - back.x, stunt.y - back.y);
    // Stunt est plus proche de la position behind (sag) que de fronting
    expect(distToBack).toBeLessThan(distToFront);
  });

  it("se rabat sur manTarget si pas de ballon disponible", () => {
    const att = { x: 470, y: 380 };
    const t = offBallStanceTarget(att, undefined, 40, 'stunt');
    expect(t).not.toBeNull();
    // Position sur l'axe homme-panier
    // panier en (300, 75), att en (470, 380), donc target.x entre 300 et 470
    expect(t!.x).toBeGreaterThan(300);
    expect(t!.x).toBeLessThan(470);
  });
});

// ============================================================================
// CVT Chantier 1.1 — Équivalence forces ↔ targets legacy
// ============================================================================

const P = (x: number, y: number): Point => ({ x, y });
const EQ_TOL = 1e-9; // bit-équivalence stricte (à 1 ULP près)

const CARRIER_BEHAVIORS: CarrierBehavior[] = [
  'coller', 'bumper', 'contester', 'reculer', 'topside', 'baseline',
];
const OFF_BALL_STANCES: OffBallStance[] = [
  'sag', 'behind', 'deny-3q', 'fronting', 'stunt',
];

// Grille de positions attaquant — coins, zones 3-points, paint, post.
const ATTACKER_GRID: Point[] = [
  P(100, 200), P(300, 200), P(500, 200), // top des 3
  P(150, 400), P(450, 400),               // wings
  P(300, 450),                            // free throw line
  P(300, 100),                            // sous le panier
  P(80, 50), P(520, 50),                  // corners
];

// Grille de défenseurs de référence (où le défenseur "habite" actuellement).
// Choisi pour être très différent du target, pour bien tester que la
// bit-équivalence est indépendante de defenderRef.
const DEFENDER_REFS: Point[] = [
  P(300, 300), P(50, 50), P(550, 1000), P(0, 0),
];

const HOOPS = [HOOP, HOOP_OPPOSITE];

function pointsEqual(a: Point, b: Point, tol = EQ_TOL): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

describe('manTargetForces — bit-équivalence avec manTarget', () => {
  it('reproduit exactement le Point legacy pour toute (att, defenderRef, distance, hoop)', () => {
    for (const hoop of HOOPS) {
      for (const att of ATTACKER_GRID) {
        for (const def of DEFENDER_REFS) {
          for (const d of [20, 30, 40, 60, 80]) {
            const legacy = manTarget(att, d, hoop);
            const forces = manTargetForces(def, att, d, hoop);
            const composed = composeTarget(def, forces);
            expect(legacy).not.toBeNull();
            expect(pointsEqual(composed, legacy!)).toBe(true);
          }
        }
      }
    }
  });

  it('retourne [] si att est undefined (parité avec manTarget → null)', () => {
    expect(manTargetForces(P(100, 100), undefined, 40)).toEqual([]);
    expect(manTarget(undefined, 40)).toBeNull();
  });

  it('retourne [] si defenderRef === target (force morte évite la singularité)', () => {
    // Cas dégénéré rare : si le défenseur est DÉJÀ pile sur la cible
    // legacy, le seek serait nul. composeTarget(def, []) retourne def
    // → bit-équivalent puisque def === target dans ce cas.
    const att = P(300, 300);
    const hoop = HOOP;
    const target = manTarget(att, 40, hoop)!;
    const forces = manTargetForces(target, att, 40, hoop);
    expect(forces).toEqual([]);
    expect(composeTarget(target, forces)).toEqual(target);
  });
});

describe('carrierDefenderTargetForces — bit-équivalence avec carrierDefenderTarget', () => {
  it('reproduit le Point legacy pour chaque CarrierBehavior, sur grille complète', () => {
    for (const hoop of HOOPS) {
      for (const vs of CARRIER_BEHAVIORS) {
        for (const att of ATTACKER_GRID) {
          for (const def of DEFENDER_REFS) {
            for (const d of [30, 40, 60]) {
              const legacy = carrierDefenderTarget(vs, att, d, hoop);
              const composed = composeTarget(def, carrierDefenderTargetForces(def, vs, att, d, hoop));
              expect(legacy).not.toBeNull();
              expect(pointsEqual(composed, legacy!)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('retourne [] si att est undefined', () => {
    expect(carrierDefenderTargetForces(P(0, 0), 'coller', undefined, 40)).toEqual([]);
  });
});

describe('offBallStanceTargetForces — bit-équivalence avec offBallStanceTarget', () => {
  it('reproduit le Point legacy pour chaque OffBallStance × ball position', () => {
    const balls: (Point | undefined)[] = [P(300, 470), P(150, 300), undefined];
    for (const hoop of HOOPS) {
      for (const stance of OFF_BALL_STANCES) {
        for (const att of ATTACKER_GRID) {
          for (const ball of balls) {
            for (const def of DEFENDER_REFS) {
              const legacy = offBallStanceTarget(att, ball, 40, stance, hoop);
              const composed = composeTarget(def, offBallStanceTargetForces(def, att, ball, 40, stance, hoop));
              expect(legacy).not.toBeNull();
              expect(pointsEqual(composed, legacy!)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('retourne [] si att est undefined', () => {
    expect(offBallStanceTargetForces(P(0, 0), undefined, P(300, 470), 40, 'sag')).toEqual([]);
  });
});

// ============================================================================
// CVT 1.1b — Amortissement `arrive` en zone proche (anti-oscillation)
// ============================================================================

describe('manTargetForces — amortissement zone proche (1.1b)', () => {
  const SLOWING = 12; // STEERING_MAN_SLOWING_RADIUS_PX (literal pour ne pas
                       // couper l'import depuis le ./data ; cf. assertion ci-dessous)

  it("en zone loin (dist >= slowingRadius) → composeTarget reproduit la cible legacy", () => {
    const att = P(300, 480);
    const def = P(300, 200); // dist ≈ 240 vs slowingRadius=12 → far
    const legacy = manTarget(att, 40)!;
    const composed = composeTarget(def, manTargetForces(def, att, 40));
    expect(Math.hypot(composed.x - legacy.x, composed.y - legacy.y)).toBeLessThan(1e-6);
  });

  it("en zone proche (dist < slowingRadius) → composeTarget produit un target amorti, jamais legacy exact", () => {
    const att = P(300, 480);
    const legacy = manTarget(att, 40)!;
    // Défenseur à 6 px de la cible legacy → strictement à l'intérieur de
    // SLOWING=12 → rampe = 0.5 → magnitude composée = 6 * 0.5 = 3 px
    const dirToLegacy = { x: (legacy.x - 300) / Math.hypot(legacy.x - 300, legacy.y - 200), y: (legacy.y - 200) / Math.hypot(legacy.x - 300, legacy.y - 200) };
    const def = P(legacy.x - dirToLegacy.x * 6, legacy.y - dirToLegacy.y * 6); // 6 px short
    const composed = composeTarget(def, manTargetForces(def, att, 40));
    const dComposedToLegacy = Math.hypot(composed.x - legacy.x, composed.y - legacy.y);
    const dDefToLegacy = Math.hypot(def.x - legacy.x, def.y - legacy.y);
    // composé strictement entre def et legacy : plus proche de legacy que def
    // mais sans atteindre legacy exact
    expect(dComposedToLegacy).toBeGreaterThan(0);
    expect(dComposedToLegacy).toBeLessThan(dDefToLegacy);
    // Formule attendue : composé = def + dir * (dist²/radius)
    // = def + dir * 36/12 = def + dir * 3 → composé à 3 px de def
    const dDefToComposed = Math.hypot(composed.x - def.x, composed.y - def.y);
    expect(dDefToComposed).toBeCloseTo(3, 6);
  });

  it("à la frontière (dist = slowingRadius) → bit-équivalent (rampe = 1)", () => {
    const att = P(300, 480);
    const legacy = manTarget(att, 40)!;
    const dx = legacy.x - 300; const dy = legacy.y - 200;
    const norm = Math.hypot(dx, dy);
    const dir = { x: dx / norm, y: dy / norm };
    // Défenseur à exactement SLOWING (12) px de legacy
    const def = P(legacy.x - dir.x * SLOWING, legacy.y - dir.y * SLOWING);
    const composed = composeTarget(def, manTargetForces(def, att, 40));
    expect(Math.hypot(composed.x - legacy.x, composed.y - legacy.y)).toBeLessThan(1e-6);
  });

  it("écart max théorique : dist = SLOWING/2 → écart à legacy = SLOWING/4", () => {
    const att = P(300, 480);
    const legacy = manTarget(att, 40)!;
    const dx = legacy.x - 300; const dy = legacy.y - 200;
    const norm = Math.hypot(dx, dy);
    const dir = { x: dx / norm, y: dy / norm };
    const halfRadius = SLOWING / 2; // 6 px
    const def = P(legacy.x - dir.x * halfRadius, legacy.y - dir.y * halfRadius);
    const composed = composeTarget(def, manTargetForces(def, att, 40));
    // Le composé est à distance² / radius = 36/12 = 3 px de def
    // → à 6 - 3 = 3 px de legacy = SLOWING/4 = écart max attendu sur tout le domaine
    const dComposedToLegacy = Math.hypot(composed.x - legacy.x, composed.y - legacy.y);
    expect(dComposedToLegacy).toBeCloseTo(SLOWING / 4, 6);
  });
});
