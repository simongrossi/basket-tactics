import type { Point } from '@/lib/types';
import { solvePointConstraints } from './constraintSolver';

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
      point: solvePointConstraints({
        point: params.point,
        obstacles: params.obstacles.map((center) => ({ center })),
        defaultMinDist: params.minDist,
      }).point,
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
      point: solvePointConstraints({
        point: params.point,
        obstacles: params.obstacles.map((center) => ({ center })),
        defaultMinDist: params.minDist,
      }).point,
      mode: 'radial',
    };
  }

  const targetSign = clusterSide >= 0 ? -1 : 1;
  const result = solvePointConstraints({
    point: params.point,
    obstacles: params.obstacles.map((center) => ({ center })),
    defaultMinDist: params.minDist,
    halfPlane: {
      origin: params.segmentStart,
      normal: { x: perpX, y: perpY },
      sign: targetSign,
    },
    fallbackDirection: { x: perpX * targetSign, y: perpY * targetSign },
  }).point;

  return { point: result, mode: 'constrained' };
}
