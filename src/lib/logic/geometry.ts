import type { Point } from '../types';
import { HOOP, PAINT } from '../data/court';

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distHoop(p: Point): number {
  return distance(p, HOOP);
}

export function inPaint(p: Point): boolean {
  return p.x >= PAINT.x1 && p.x <= PAINT.x2 && p.y >= PAINT.y1 && p.y <= PAINT.y2;
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normalize(p: Point): Point {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
}

export function ballSide(carrierPos: Point | undefined): -1 | 0 | 1 {
  if (!carrierPos) return 0;
  const dx = carrierPos.x - HOOP.x;
  if (Math.abs(dx) < 30) return 0;
  return dx > 0 ? 1 : -1;
}

/**
 * Si `pos` est trop proche d'un `obstacle`, le pousse radialement
 * jusqu'à `minDist` du centre. Sinon retourne pos inchangé.
 */
export function pushOutOf(pos: Point, obstacle: Point, minDist: number): Point {
  const dx = pos.x - obstacle.x;
  const dy = pos.y - obstacle.y;
  const d = Math.hypot(dx, dy);
  if (d >= minDist) return pos;
  if (d < 0.01) {
    // Position confondue : on pousse arbitrairement vers la droite.
    return { x: obstacle.x + minDist, y: obstacle.y };
  }
  const k = minDist / d;
  return {
    x: obstacle.x + dx * k,
    y: obstacle.y + dy * k,
  };
}

/**
 * Pousse `pos` hors d'une liste d'obstacles. Plusieurs passes pour gérer les
 * cas en chaîne.
 */
export function pushOutOfMany(pos: Point, obstacles: Point[], minDist: number): Point {
  let result = pos;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const obs of obstacles) {
      const next = pushOutOf(result, obs, minDist);
      if (next.x !== result.x || next.y !== result.y) {
        result = next;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return result;
}

/**
 * Position interpolée entre `start` et `end` au paramètre `t`,
 * MAIS en contournant `obstacle` via une courbe Bezier quadratique
 * si le segment direct passe au travers du cercle de l'obstacle.
 *
 * Le côté de contournement est choisi automatiquement : on dévie
 * dans la direction opposée à l'obstacle par rapport au segment direct.
 */
export function curveAroundObstacle(
  start: Point,
  end: Point,
  obstacle: Point,
  obstacleRadius: number,
  t: number
): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return start;
  const ux = dx / len;
  const uy = dy / len;

  // Projection de l'obstacle sur le segment
  const ox = obstacle.x - start.x;
  const oy = obstacle.y - start.y;
  const proj = ox * ux + oy * uy;
  if (proj < 0 || proj > len) {
    // L'obstacle est hors du segment → ligne droite
    return { x: start.x + dx * t, y: start.y + dy * t };
  }
  const closestX = start.x + proj * ux;
  const closestY = start.y + proj * uy;
  const distToLine = Math.hypot(obstacle.x - closestX, obstacle.y - closestY);
  if (distToLine >= obstacleRadius) {
    return { x: start.x + dx * t, y: start.y + dy * t };
  }

  // Le segment passe à travers. On dévie perpendiculairement, du
  // côté OPPOSÉ à l'obstacle par rapport au segment.
  const perpX = -uy;
  const perpY = ux;
  const cross = ox * perpX + oy * perpY;
  const pushSign = cross >= 0 ? -1 : 1;

  const peak = obstacleRadius + 6; // amplitude du contournement au sommet
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const ctrlX = mx + perpX * 2 * peak * pushSign;
  const ctrlY = my + perpY * 2 * peak * pushSign;

  // Bezier quadratique
  const omt = 1 - t;
  return {
    x: omt * omt * start.x + 2 * omt * t * ctrlX + t * t * end.x,
    y: omt * omt * start.y + 2 * omt * t * ctrlY + t * t * end.y,
  };
}
