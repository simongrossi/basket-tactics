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
});
