import { describe, it, expect } from 'vitest';
import { curveAroundObstacle } from '../geometry';

describe('curveAroundObstacle apexSlowness — pause sur écran', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const obstacle = { x: 50, y: 0 }; // pile au milieu, ligne droite traverse
  const radius = 20;

  function distAtMidT(slowness: number): number {
    // Distance entre la position à t=0.5 et la position à t=0.55.
    // Une slowness forte → cette distance est petite (le défenseur stagne).
    const a = curveAroundObstacle(start, end, obstacle, radius, 0.5, slowness);
    const b = curveAroundObstacle(start, end, obstacle, radius, 0.55, slowness);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  it('slowness 0.3 (défaut) : déplacement normal au sommet', () => {
    const d = distAtMidT(0.3);
    expect(d).toBeGreaterThan(0); // bouge encore
  });

  it('slowness 0.98 (lockdown) : déplacement quasi nul au sommet', () => {
    const dDefault = distAtMidT(0.3);
    const dLockdown = distAtMidT(0.98);
    // Le mouvement au sommet est ~30x plus petit avec slowness forte.
    expect(dLockdown).toBeLessThan(dDefault * 0.3);
  });

  it('slowness ≥ 1 est clampé (pas de marche arrière)', () => {
    // À t=0.5 puis t=0.55, la position doit toujours progresser (x croît).
    const a = curveAroundObstacle(start, end, obstacle, radius, 0.5, 5);
    const b = curveAroundObstacle(start, end, obstacle, radius, 0.55, 5);
    expect(b.x).toBeGreaterThanOrEqual(a.x);
  });

  it('aux extrémités (t=0, t=1) la position reste correcte quelle que soit la slowness', () => {
    expect(curveAroundObstacle(start, end, obstacle, radius, 0, 0.98)).toEqual({ x: 0, y: 0 });
    const endPoint = curveAroundObstacle(start, end, obstacle, radius, 1, 0.98);
    expect(endPoint.x).toBeCloseTo(100, 1);
    expect(endPoint.y).toBeCloseTo(0, 1);
  });
});
