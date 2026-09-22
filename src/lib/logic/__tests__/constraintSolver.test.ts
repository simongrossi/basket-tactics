import { describe, expect, it } from 'vitest';
import { solveEntityCollisions, solveMovingEntityCollisions, solvePointConstraints } from '../constraintSolver';
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

  it('résout les collisions multi-entités sans déplacer les entités fixes', () => {
    const solved = solveEntityCollisions({
      entities: [
        { id: 'D1', point: { x: 0, y: 0 }, fixed: true },
        { id: 'D2', point: { x: 4, y: 0 } },
      ],
      staticObstacles: [{ center: { x: 40, y: 0 } }],
      defaultMinDist: 20,
    });

    expect(solved.positions.D1).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(
      solved.positions.D2!.x - solved.positions.D1!.x,
      solved.positions.D2!.y - solved.positions.D1!.y
    )).toBeGreaterThanOrEqual(20);
  });

  it('traite les obstacles fixes et les entités mobiles dans le même solveur', () => {
    const solved = solveEntityCollisions({
      entities: [
        { id: 'D1', point: { x: 3, y: 0 } },
        { id: 'D2', point: { x: 48, y: 0 } },
      ],
      staticObstacles: [{ center: { x: 0, y: 0 } }],
      defaultMinDist: 20,
    });

    expect(Math.hypot(solved.positions.D1!.x, solved.positions.D1!.y))
      .toBeGreaterThanOrEqual(20);
    expect(Math.hypot(
      solved.positions.D2!.x - solved.positions.D1!.x,
      solved.positions.D2!.y - solved.positions.D1!.y
    )).toBeGreaterThanOrEqual(20);
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


describe('solveMovingEntityCollisions', () => {
  it('résout simultanément contact et mouvement sans changer de côté ni déplacer le poseur', () => {
    const entities = [
      { id: 'O5', point: { x: 0, y: 0 }, previous: { x: 0, y: 0 }, fixed: true, maxDelta: 18 },
      { id: 'D1', point: { x: -10, y: 8 }, previous: { x: -34, y: 0 }, maxDelta: 18 },
      { id: 'O1', point: { x: -38, y: 8 }, previous: { x: -68, y: 0 }, maxDelta: 18 },
    ];
    const snapshot = structuredClone(entities);
    const result = solveMovingEntityCollisions({ entities, defaultMinDist: 34 });
    expect(result.O5).toEqual(entities[0].point);
    expect(result.D1!.x).toBeLessThanOrEqual(-34 + 0.0001);
    for (const entity of entities) {
      expect(Math.hypot(result[entity.id]!.x - entity.previous.x, result[entity.id]!.y - entity.previous.y))
        .toBeLessThanOrEqual(18.0001);
      for (const other of entities) {
        if (entity === other) continue;
        expect(Math.hypot(result[entity.id]!.x - result[other.id]!.x, result[entity.id]!.y - result[other.id]!.y))
          .toBeGreaterThanOrEqual(33.9999);
      }
    }
    expect(entities).toEqual(snapshot);
    expect(solveMovingEntityCollisions({ entities, defaultMinDist: 34 })).toEqual(result);
  });

  it('priorise la séparation lorsque des ancres importées sont confondues', () => {
    const entities = ['O4', 'O5', 'D1'].map(id => ({
      id, point: { x: 100, y: 100 }, previous: { x: 100, y: 100 },
      fixed: id.startsWith('O'), maxDelta: 18,
    }));
    const result = solveMovingEntityCollisions({ entities, defaultMinDist: 34 });
    expect(result.O4).toEqual(entities[0].point);
    const points = Object.values(result);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)).toBeGreaterThanOrEqual(33.9999);
      }
    }
  });
});
