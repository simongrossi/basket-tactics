// Tests CVT 1.3 — Forces de répulsion autour des poseurs d'écran.
//
// Vérifie l'API publique de `screens/repelForces.ts` : direction radiale,
// falloff linéaire, force morte hors rayon, batch indexé.

import { describe, expect, it } from 'vitest';
import {
  SCREEN_REPEL_RADIUS_PX,
  screenerRepelForce,
  screenersRepelForces,
} from '../repelForces';
import { MIN_PLAYER_CLEARANCE_PX } from '../../../data/physics';

const P = (x: number, y: number) => ({ x, y });

describe('SCREEN_REPEL_RADIUS_PX — constante calculée', () => {
  it('est cohérente avec MIN_PLAYER_CLEARANCE_PX + buffer', () => {
    expect(SCREEN_REPEL_RADIUS_PX).toBeGreaterThan(MIN_PLAYER_CLEARANCE_PX);
    expect(SCREEN_REPEL_RADIUS_PX - MIN_PLAYER_CLEARANCE_PX).toBe(12); // buffer
  });
});

describe('screenerRepelForce — primitive', () => {
  it('direction radiale (du poseur vers le défenseur) dans le rayon', () => {
    // Défenseur dans le rayon (SCREEN_REPEL_RADIUS_PX ≈ 46)
    const f = screenerRepelForce(P(20, 0), P(0, 0));
    expect(f.direction.x).toBeCloseTo(1, 6);
    expect(f.direction.y).toBeCloseTo(0, 6);
    expect(f.weight).toBeGreaterThan(0);
  });

  it("falloff linéaire dans le rayon", () => {
    const screener = P(0, 0);
    // À mi-rayon → falloff = 0.5
    const fMid = screenerRepelForce(P(SCREEN_REPEL_RADIUS_PX / 2, 0), screener, 20);
    expect(fMid.weight).toBeCloseTo(20 * 0.5, 6);
    // Près du contact → falloff ≈ 1
    const fNear = screenerRepelForce(P(1, 0), screener, 20);
    expect(fNear.weight).toBeGreaterThan(20 * 0.9);
  });

  it('force morte hors rayon (glissement fluide, pas de mur)', () => {
    const f = screenerRepelForce(P(SCREEN_REPEL_RADIUS_PX + 10, 0), P(0, 0));
    expect(f.weight).toBe(0);
    expect(f.direction).toEqual({ x: 0, y: 0 });
  });

  it('force morte au cas dégénéré defenderRef === screener (Règle 1 reste protégée par le solveur)', () => {
    const f = screenerRepelForce(P(0, 0), P(0, 0));
    expect(f.weight).toBe(0);
  });

  it('label personnalisable pour debug', () => {
    const f = screenerRepelForce(P(10, 0), P(0, 0), 20, 'my-screener-D5');
    expect(f.label).toBe('my-screener-D5');
  });
});

describe('screenersRepelForces — batch indexé', () => {
  it('émet une force par poseur, labels indexés', () => {
    const screeners = [P(10, 0), P(0, 10), P(-10, 0)];
    const forces = screenersRepelForces(P(0, 0), screeners);
    expect(forces).toHaveLength(3);
    expect(forces[0].label).toBe('repel-screener-0');
    expect(forces[1].label).toBe('repel-screener-1');
    expect(forces[2].label).toBe('repel-screener-2');
  });

  it("retourne forces mortes hors rayon (filtrables par accumulateur)", () => {
    const screeners = [P(10, 0), P(1000, 1000)]; // 2e très loin
    const forces = screenersRepelForces(P(0, 0), screeners);
    expect(forces[0].weight).toBeGreaterThan(0);
    expect(forces[1].weight).toBe(0);
  });

  it('liste vide → tableau vide', () => {
    expect(screenersRepelForces(P(0, 0), [])).toEqual([]);
  });
});
