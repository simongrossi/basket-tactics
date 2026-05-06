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
