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
  });

  it('conserve le côté opposé au cluster même si le point brut dérive', () => {
    const solved = pushOutOfScreenContact({
      point: { x: 50, y: 5 },
      obstacles: [{ x: 50, y: 8 }],
      minDist: 10,
      segmentStart: { x: 0, y: 0 },
      segmentEnd: { x: 100, y: 0 },
      clusterCenter: { x: 50, y: 20 },
    });

    expect(solved.mode).toBe('constrained');
    expect(solved.point.y).toBeLessThan(0);
  });
});
