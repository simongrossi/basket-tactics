import type { Point } from '../../types';
import { distance } from '../geometry';

export interface SpacingGraph {
  ids: string[];
  dist: number[][];
}

export function buildSpacingGraph(players: Record<string, Point>): SpacingGraph {
  const ids = Object.keys(players).sort();
  const n = ids.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distance(players[ids[i]], players[ids[j]]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  return { ids, dist };
}

export function totalSpacing(g: SpacingGraph): number {
  let sum = 0;
  const n = g.ids.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) sum += g.dist[i][j];
  }
  return sum;
}

export function avgPairwiseDistance(g: SpacingGraph): number {
  const n = g.ids.length;
  const edges = (n * (n - 1)) / 2;
  if (edges === 0) return 0;
  return totalSpacing(g) / edges;
}

export function maxPairwiseDistance(g: SpacingGraph): number {
  let max = 0;
  const n = g.ids.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (g.dist[i][j] > max) max = g.dist[i][j];
    }
  }
  return max;
}

export function centralityScores(g: SpacingGraph): Record<string, number> {
  const out: Record<string, number> = {};
  const n = g.ids.length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += g.dist[i][j];
    out[g.ids[i]] = s;
  }
  return out;
}

export function pivotPlayer(g: SpacingGraph): string {
  const scores = centralityScores(g);
  let best = g.ids[0];
  let bestVal = Infinity;
  for (const id of g.ids) {
    if (scores[id] < bestVal) {
      bestVal = scores[id];
      best = id;
    }
  }
  return best;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points: Point[]): Point[] {
  const n = points.length;
  if (n <= 1) return points.slice();
  const sorted = points
    .slice()
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const uniq: Point[] = [];
  for (const p of sorted) {
    const last = uniq[uniq.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) uniq.push(p);
  }
  if (uniq.length <= 1) return uniq;
  if (uniq.length === 2) return uniq;

  const lower: Point[] = [];
  for (const p of uniq) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function polygonArea(poly: Point[]): number {
  const n = poly.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
