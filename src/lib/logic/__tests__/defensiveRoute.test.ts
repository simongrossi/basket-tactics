import { describe, it, expect } from 'vitest';
import { computeDefensiveRoute } from '../defensiveRoute';

describe('defensiveRoute — computeDefensiveRoute', () => {
  it('retourne le trajet droit sans obstacle', () => {
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(r.waypoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(r.length).toBeCloseTo(100);
  });

  it('retourne droit si les obstacles ne bloquent pas le segment', () => {
    const r = computeDefensiveRoute(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ center: { x: 50, y: 200 }, radius: 34 }],
    );
    expect(r.waypoints).toHaveLength(2);
  });

  it('contourne un obstacle posé sur le segment', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const obs = { center: { x: 50, y: 0 }, radius: 34 };
    const r = computeDefensiveRoute(from, to, [obs]);
    expect(r.waypoints).toHaveLength(3);
    const mid = r.waypoints[1];
    // le waypoint de détour est au moins à `radius` du centre de l'obstacle
    expect(Math.hypot(mid.x - obs.center.x, mid.y - obs.center.y))
      .toBeGreaterThanOrEqual(34);
    // la route détournée est plus longue que le trajet droit
    expect(r.length).toBeGreaterThan(100);
  });

  it('choisit le côté de détour le plus court', () => {
    // obstacle légèrement décalé vers +y → le détour le plus court passe
    // du côté -y (opposé au décalage).
    const obs = { center: { x: 50, y: 5 }, radius: 34 };
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obs]);
    expect(r.waypoints).toHaveLength(3);
    expect(r.waypoints[1].y).toBeLessThan(0);
  });
});
