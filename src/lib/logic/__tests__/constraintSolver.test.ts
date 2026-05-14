import { describe, expect, it } from 'vitest';
import { solvePointConstraints } from '../constraintSolver';
import { pushOutOfScreenContact } from '../screenCollision';

describe('constraintSolver', () => {
  it('reproduit le push radial multi-obstacles sans demi-plan', () => {
    const point = { x: 10, y: 0 };
    const obstacles = [{ x: 0, y: 0 }, { x: 25, y: 0 }];
    const minDist = 20;

    const solved = solvePointConstraints({
      point,
      obstacles: obstacles.map((center) => ({ center })),
      defaultMinDist: minDist,
    }).point;

    expect(solved).toEqual(legacyPushOutOfMany(point, obstacles, minDist));
  });

  it('garde le résultat du côté autorisé du demi-plan', () => {
    const solved = solvePointConstraints({
      point: { x: 0, y: 4 },
      obstacles: [{ center: { x: 0, y: 0 } }],
      defaultMinDist: 20,
      halfPlane: {
        origin: { x: 0, y: 0 },
        normal: { x: 0, y: 1 },
        sign: -1,
      },
      fallbackDirection: { x: 0, y: -1 },
    }).point;

    expect(solved.y).toBeLessThanOrEqual(0);
    expect(Math.hypot(solved.x, solved.y)).toBeGreaterThanOrEqual(20);
  });
});

function legacyPushOutOfMany(point: { x: number; y: number }, obstacles: Array<{ x: number; y: number }>, minDist: number) {
  let result = point;
  for (let iter = 0; iter < 5; iter++) {
    let moved = false;
    for (const obstacle of obstacles) {
      const next = legacyPushOutOf(result, obstacle, minDist);
      if (next.x !== result.x || next.y !== result.y) {
        result = next;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return result;
}

function legacyPushOutOf(point: { x: number; y: number }, obstacle: { x: number; y: number }, minDist: number) {
  const dx = point.x - obstacle.x;
  const dy = point.y - obstacle.y;
  const d = Math.hypot(dx, dy);
  if (d >= minDist) return point;
  if (d < 0.01) return { x: obstacle.x + minDist, y: obstacle.y };
  const k = minDist / d;
  return { x: obstacle.x + dx * k, y: obstacle.y + dy * k };
}

describe('pushOutOfScreenContact', () => {
  it('utilise le socle de contraintes sans franchir vers le cluster', () => {
    const solved = pushOutOfScreenContact({
      point: { x: 0, y: 4 },
      obstacles: [{ x: 0, y: 0 }],
      minDist: 20,
      segmentStart: { x: -40, y: 0 },
      segmentEnd: { x: 40, y: 0 },
      clusterCenter: { x: 0, y: 30 },
    });

    expect(solved.mode).toBe('constrained');
    expect(solved.point.y).toBeLessThanOrEqual(0);
  });
});
