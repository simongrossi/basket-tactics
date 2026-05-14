import { describe, expect, it } from 'vitest';
import { pushOutOfScreenContact } from '../screenCollision';

describe('screenCollision', () => {
  it('empêche un push radial de franchir vers le cluster écran', () => {
    const solved = pushOutOfScreenContact({
      point: { x: 50, y: -5 },
      obstacles: [{ x: 50, y: -8 }],
      minDist: 10,
      segmentStart: { x: 0, y: 0 },
      segmentEnd: { x: 100, y: 0 },
      clusterCenter: { x: 50, y: 20 },
    });

    expect(solved.mode).toBe('constrained');
    expect(solved.point.y).toBeLessThan(0);
    expect(Math.hypot(solved.point.x - 50, solved.point.y + 8)).toBeGreaterThanOrEqual(10);
  });

  it('retombe sur le push radial si le défenseur part côté cluster', () => {
    const solved = pushOutOfScreenContact({
      point: { x: 50, y: 5 },
      obstacles: [{ x: 50, y: 8 }],
      minDist: 10,
      segmentStart: { x: 0, y: 0 },
      segmentEnd: { x: 100, y: 0 },
      clusterCenter: { x: 50, y: 20 },
    });

    expect(solved.mode).toBe('radial');
  });
});
