import type { Point } from '@/lib/types';
import { pushOutOfMany } from './geometry';

export interface ScreenContactCollisionResult {
  point: Point;
  mode: 'constrained' | 'radial';
}

export function pushOutOfScreenContact(params: {
  point: Point;
  obstacles: Point[];
  minDist: number;
  segmentStart: Point;
  segmentEnd: Point;
  clusterCenter: Point;
}): ScreenContactCollisionResult {
  const segDx = params.segmentEnd.x - params.segmentStart.x;
  const segDy = params.segmentEnd.y - params.segmentStart.y;
  const segLen = Math.hypot(segDx, segDy);
  if (segLen < 0.01) {
    return {
      point: pushOutOfMany(params.point, params.obstacles, params.minDist),
      mode: 'radial',
    };
  }

  const perpX = -segDy / segLen;
  const perpY = segDx / segLen;
  const clusterSide =
    (params.clusterCenter.x - params.segmentStart.x) * perpX +
    (params.clusterCenter.y - params.segmentStart.y) * perpY;
  if (Math.abs(clusterSide) < 12) {
    return {
      point: pushOutOfMany(params.point, params.obstacles, params.minDist),
      mode: 'radial',
    };
  }

  const targetSign = clusterSide >= 0 ? -1 : 1;
  let result = params.point;
  for (let iter = 0; iter < 5; iter++) {
    let moved = false;
    for (const o of params.obstacles) {
      const dx = result.x - o.x;
      const dy = result.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= params.minDist) continue;
      let nx: number;
      let ny: number;
      if (d < 0.01) {
        nx = o.x + perpX * targetSign * params.minDist;
        ny = o.y + perpY * targetSign * params.minDist;
      } else {
        const k = params.minDist / d;
        nx = o.x + dx * k;
        ny = o.y + dy * k;
        const candSide =
          (nx - params.segmentStart.x) * perpX +
          (ny - params.segmentStart.y) * perpY;
        if (Math.sign(candSide) !== 0 && Math.sign(candSide) !== targetSign) {
          const correction = 2 * candSide;
          nx -= correction * perpX;
          ny -= correction * perpY;
        }
      }
      if (Math.abs(nx - result.x) > 0.001 || Math.abs(ny - result.y) > 0.001) {
        result = { x: nx, y: ny };
        moved = true;
      }
    }
    if (!moved) break;
  }

  return { point: result, mode: 'constrained' };
}
