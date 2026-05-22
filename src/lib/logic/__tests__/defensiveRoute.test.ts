import { describe, it, expect } from 'vitest';
import { computeDefensiveRoute, sampleRoute } from '../defensiveRoute';

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

  it('from == to → route dégénérée de longueur 0', () => {
    const r = computeDefensiveRoute(
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      [{ center: { x: 10, y: 10 }, radius: 34 }],
    );
    expect(r.length).toBe(0);
    expect(r.waypoints).toEqual([{ x: 10, y: 10 }, { x: 10, y: 10 }]);
  });

  it('est déterministe (2 appels successifs = résultat identique)', () => {
    const obs = [
      { center: { x: 50, y: 0 }, radius: 34 },
      { center: { x: 60, y: 10 }, radius: 30 },
    ];
    const a = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    const b = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    expect(a).toEqual(b);
  });

  it('dégrade gracieusement quand aucune route candidate n\'est dégagée', () => {
    // Obstacles serrés des deux côtés du détour → aucune route à 1 waypoint
    // n'est totalement dégagée. Le module renvoie quand même une route.
    const obs = [
      { center: { x: 50, y: 0 }, radius: 34 },
      { center: { x: 50, y: 80 }, radius: 60 },
      { center: { x: 50, y: -80 }, radius: 60 },
    ];
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, obs);
    expect(r.waypoints).toHaveLength(3);
    expect(Number.isFinite(r.length)).toBe(true);
  });
});

describe('defensiveRoute — sampleRoute', () => {
  it('renvoie from à t=0 et to à t=1', () => {
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(sampleRoute(r, 0)).toEqual({ x: 0, y: 0 });
    expect(sampleRoute(r, 1)).toEqual({ x: 100, y: 0 });
  });

  it('suit le détour à mi-parcours', () => {
    const obs = { center: { x: 50, y: 0 }, radius: 34 };
    const r = computeDefensiveRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obs]);
    const mid = sampleRoute(r, 0.5);
    // à mi-parcours la position est écartée de l'axe direct y=0
    expect(Math.abs(mid.y)).toBeGreaterThan(10);
  });
});
