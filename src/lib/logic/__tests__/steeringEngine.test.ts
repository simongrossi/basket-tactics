// Tests du moteur de forces vectorielles — Chantier 1 CVT.
// Couvre les 3 primitives (seek/repel/arrive), l'accumulateur additif
// et l'intégration avec clamp de pas. Vérifie aussi les invariants
// (commutativité, cas dégénérés, forces mortes).

import { describe, expect, it } from 'vitest';
import {
  accumulateForces,
  arrive,
  integrateForce,
  repel,
  seek,
  type SteeringForce,
} from '@/lib/logic/steeringEngine';

const P = (x: number, y: number) => ({ x, y });
const EPS = 1e-9;

describe('steeringEngine — seek', () => {
  it('retourne un vecteur unitaire vers la cible', () => {
    const f = seek(P(0, 0), P(10, 0), 1, 'seek-east');
    expect(f.direction.x).toBeCloseTo(1, 6);
    expect(f.direction.y).toBeCloseTo(0, 6);
    expect(f.weight).toBe(1);
    expect(f.label).toBe('seek-east');
  });

  it('normalise la direction quelle que soit la distance', () => {
    const f = seek(P(0, 0), P(300, 400), 2, 'seek-far');
    expect(Math.hypot(f.direction.x, f.direction.y)).toBeCloseTo(1, 6);
    expect(f.direction.x).toBeCloseTo(0.6, 6);
    expect(f.direction.y).toBeCloseTo(0.8, 6);
    expect(f.weight).toBe(2);
  });

  it('force morte si weight ≤ 0', () => {
    const f = seek(P(0, 0), P(10, 0), 0, 'seek-zero');
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });

  it('force morte si from === target', () => {
    const f = seek(P(50, 50), P(50, 50), 1, 'seek-self');
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });
});

describe('steeringEngine — repel', () => {
  it('repousse radialement depuis l\'obstacle', () => {
    const f = repel(P(10, 0), P(0, 0), 20, 1, 'repel-east');
    expect(f.direction.x).toBeCloseTo(1, 6);
    expect(f.direction.y).toBeCloseTo(0, 6);
    expect(f.weight).toBeGreaterThan(0);
  });

  it('décroît linéairement avec la distance (falloff)', () => {
    // À mi-rayon (10/20 = 0.5), falloff = 1 - 0.5 = 0.5 → weight = 1 * 0.5
    const fHalf = repel(P(10, 0), P(0, 0), 20, 1, 'repel-half');
    expect(fHalf.weight).toBeCloseTo(0.5, 6);
    // Près du contact (1/20 = 0.05), falloff = 0.95 → weight ≈ 0.95
    const fNear = repel(P(1, 0), P(0, 0), 20, 1, 'repel-near');
    expect(fNear.weight).toBeCloseTo(0.95, 6);
  });

  it('force morte hors du rayon (glissement fluide, pas de mur)', () => {
    const f = repel(P(30, 0), P(0, 0), 20, 1, 'repel-out');
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });

  it('force morte au cas dégénéré from === obstacle (anti-singularité)', () => {
    const f = repel(P(5, 5), P(5, 5), 20, 1, 'repel-overlap');
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });

  it('force morte si weight ≤ 0 ou radius ≤ 0', () => {
    expect(repel(P(1, 0), P(0, 0), 20, 0, 'w0').weight).toBe(0);
    expect(repel(P(1, 0), P(0, 0), 0, 1, 'r0').weight).toBe(0);
    expect(repel(P(1, 0), P(0, 0), -5, 1, 'r-').weight).toBe(0);
  });
});

describe('steeringEngine — arrive', () => {
  it('équivalent à seek hors du slowingRadius (rampe = 1)', () => {
    const sk = seek(P(0, 0), P(100, 0), 1, 's');
    const ar = arrive(P(0, 0), P(100, 0), 20, 1, 'a'); // dist=100, slowing=20
    expect(ar.direction.x).toBeCloseTo(sk.direction.x, 6);
    expect(ar.direction.y).toBeCloseTo(sk.direction.y, 6);
    expect(ar.weight).toBe(1); // rampe clampée à 1
  });

  it('décélère linéairement dans le slowingRadius', () => {
    // dist = 10, slowingRadius = 20 → rampe = 0.5 → weight = 1 * 0.5
    const f = arrive(P(0, 0), P(10, 0), 20, 1, 'arrive-half');
    expect(f.weight).toBeCloseTo(0.5, 6);
    expect(f.direction.x).toBeCloseTo(1, 6);
  });

  it('force morte à la cible (anti-oscillation)', () => {
    const f = arrive(P(50, 50), P(50, 50), 20, 1, 'arrive-on-target');
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });

  it('force morte si weight ≤ 0 ou slowingRadius ≤ 0', () => {
    expect(arrive(P(0, 0), P(10, 0), 20, 0, 'w0').weight).toBe(0);
    expect(arrive(P(0, 0), P(10, 0), 0, 1, 's0').weight).toBe(0);
  });
});

describe('steeringEngine — accumulateForces', () => {
  it('retourne le vecteur nul pour une liste vide', () => {
    expect(accumulateForces([])).toEqual({ x: 0, y: 0 });
  });

  it('somme pondérée additive (Reynolds)', () => {
    const forces: SteeringForce[] = [
      { direction: P(1, 0), weight: 2, label: 'east' },
      { direction: P(0, 1), weight: 3, label: 'south' },
    ];
    const sum = accumulateForces(forces);
    expect(sum.x).toBeCloseTo(2, 6);
    expect(sum.y).toBeCloseTo(3, 6);
  });

  it('ignore les forces de poids nul ou négatif', () => {
    const forces: SteeringForce[] = [
      { direction: P(1, 0), weight: 5, label: 'active' },
      { direction: P(0, 1), weight: 0, label: 'dead' },
      { direction: P(-1, 0), weight: -2, label: 'invalid' },
    ];
    const sum = accumulateForces(forces);
    expect(sum.x).toBeCloseTo(5, 6);
    expect(sum.y).toBeCloseTo(0, 6);
  });

  it('est commutatif (ordre indépendant)', () => {
    const a: SteeringForce = { direction: P(0.6, 0.8), weight: 3, label: 'a' };
    const b: SteeringForce = { direction: P(-1, 0), weight: 2, label: 'b' };
    const c: SteeringForce = { direction: P(0, -1), weight: 4, label: 'c' };
    const s1 = accumulateForces([a, b, c]);
    const s2 = accumulateForces([c, a, b]);
    const s3 = accumulateForces([b, c, a]);
    expect(s1.x).toBeCloseTo(s2.x, 9);
    expect(s1.y).toBeCloseTo(s2.y, 9);
    expect(s1.x).toBeCloseTo(s3.x, 9);
    expect(s1.y).toBeCloseTo(s3.y, 9);
  });

  it('forces opposées strictement égales s\'annulent', () => {
    const forces: SteeringForce[] = [
      { direction: P(1, 0), weight: 5, label: 'east' },
      { direction: P(-1, 0), weight: 5, label: 'west' },
    ];
    const sum = accumulateForces(forces);
    expect(Math.abs(sum.x)).toBeLessThan(EPS);
    expect(Math.abs(sum.y)).toBeLessThan(EPS);
  });
});

describe('steeringEngine — integrateForce', () => {
  it('avance dans la direction de la force', () => {
    const out = integrateForce(P(100, 100), P(3, 4), 10);
    // |force| = 5 < maxStep=10, donc pas de clamp
    expect(out.x).toBeCloseTo(103, 6);
    expect(out.y).toBeCloseTo(104, 6);
  });

  it('clampe la magnitude au maxStep (anti-téléportation)', () => {
    const out = integrateForce(P(0, 0), P(30, 40), 5); // |force|=50 → clamp à 5
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(5, 6);
    expect(out.x).toBeCloseTo(3, 6); // direction préservée
    expect(out.y).toBeCloseTo(4, 6);
  });

  it('no-op si force nulle', () => {
    const out = integrateForce(P(10, 20), P(0, 0), 5);
    expect(out).toEqual({ x: 10, y: 20 });
  });

  it('no-op si maxStep ≤ 0', () => {
    expect(integrateForce(P(10, 20), P(3, 4), 0)).toEqual({ x: 10, y: 20 });
    expect(integrateForce(P(10, 20), P(3, 4), -1)).toEqual({ x: 10, y: 20 });
  });
});

describe('steeringEngine — composition réaliste', () => {
  it('seek vers cible + repel d\'obstacle → glissement latéral', () => {
    // Défenseur à (0,0), cible à (20,0), obstacle pile en chemin à (10,0).
    // seek pointe est, repel pointe ouest → mais on s'attend à une
    // composante latérale émergente si l'obstacle est légèrement décalé.
    const from = P(0, 0);
    const target = P(20, 0);
    const obstacle = P(10, 2); // légèrement au sud du chemin direct
    const fSeek = seek(from, target, 1, 'seek');
    const fRepel = repel(from, obstacle, 15, 1, 'repel'); // dans le rayon
    const sum = accumulateForces([fSeek, fRepel]);
    // La force résultante doit pointer vers le nord-est
    // (cible à l'est + répulsion vers le nord depuis obstacle au sud)
    expect(sum.x).toBeGreaterThan(0); // vers la cible
    expect(sum.y).toBeLessThan(0); // glisse vers le nord (loin de l'obstacle)
  });

  it('arrive seul à la cible → position stable (zéro déplacement)', () => {
    const pos = P(50, 50);
    const f = arrive(pos, pos, 20, 1, 'arrive');
    const sum = accumulateForces([f]);
    const next = integrateForce(pos, sum, 10);
    expect(next).toEqual(pos);
  });
});
