import type { Point } from '../../types';

export const EJO_CORRIDOR_NARROW_PX = 55.5;
export const EJO_CORRIDOR_WIDE_PX = 92.5;

export interface EJOCorridor {
  ball: Point;
  target: Point;
  axis: Point;
  length: number;
  halfWidthPx: number;
}

export function buildEJO(
  ball: Point,
  target: Point,
  halfWidthPx: number = EJO_CORRIDOR_NARROW_PX,
): EJOCorridor {
  const dx = target.x - ball.x;
  const dy = target.y - ball.y;
  const length = Math.hypot(dx, dy);
  const axis: Point =
    length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
  return { ball, target, axis, length, halfWidthPx };
}

export function signedDistanceToAxis(p: Point, c: EJOCorridor): number {
  const vx = p.x - c.ball.x;
  const vy = p.y - c.ball.y;
  return c.axis.x * vy - c.axis.y * vx;
}

function projectionAlongAxis(p: Point, c: EJOCorridor): number {
  const vx = p.x - c.ball.x;
  const vy = p.y - c.ball.y;
  return c.axis.x * vx + c.axis.y * vy;
}

export function inCorridor(p: Point, c: EJOCorridor): boolean {
  if (c.length === 0) return false;
  const t = projectionAlongAxis(p, c);
  if (t < 0 || t > c.length) return false;
  return Math.abs(signedDistanceToAxis(p, c)) <= c.halfWidthPx;
}

export function corridorBlockers(
  c: EJOCorridor,
  defenders: Record<string, Point>,
): string[] {
  const inside: { id: string; t: number }[] = [];
  for (const [id, p] of Object.entries(defenders)) {
    if (!inCorridor(p, c)) continue;
    inside.push({ id, t: projectionAlongAxis(p, c) });
  }
  inside.sort((a, b) => a.t - b.t);
  return inside.map((x) => x.id);
}
