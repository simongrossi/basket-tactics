import type { Point } from '@/lib/types';

const AMPLITUDE = 5;
const WAVELENGTH = 14;

function geometry(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    dx, dy,
    nx: -dy / len,
    ny: dx / len,
    segs: Math.max(4, Math.round(len / WAVELENGTH)),
  };
}

/**
 * Échantillonne la position du porteur le long de la wave de dribble
 * à un instant `t ∈ [0, 1]`. Reproduit exactement la géométrie du tracé SVG.
 */
export function sampleDribbleWave(from: Point, to: Point, t: number): Point {
  if (t <= 0) return { x: from.x, y: from.y };
  if (t >= 1) return { x: to.x, y: to.y };
  const { dx, dy, nx, ny, segs } = geometry(from, to);

  const knotAt = (idx: number): Point => {
    const tt = idx / segs;
    const offset =
      idx === 0 || idx === segs
        ? 0
        : AMPLITUDE * (idx % 2 === 0 ? 1 : -1);
    return {
      x: from.x + dx * tt + nx * offset,
      y: from.y + dy * tt + ny * offset,
    };
  };

  const seg = t * segs;
  const i = Math.floor(seg);
  const subT = seg - i;
  const a = knotAt(i);
  const b = knotAt(i + 1);
  return {
    x: a.x + (b.x - a.x) * subT,
    y: a.y + (b.y - a.y) * subT,
  };
}

/**
 * Génère le chemin SVG `d="..."` correspondant à la wave de dribble
 * (équivalent à l'ancien `dribblePath` de Annotations.tsx).
 */
export function dribbleWavePath(from: Point, to: Point): string {
  const { dx, dy, nx, ny, segs } = geometry(from, to);
  let d = `M ${from.x} ${from.y}`;
  for (let i = 1; i < segs; i++) {
    const tt = i / segs;
    const sign = i % 2 === 0 ? 1 : -1;
    const px = from.x + dx * tt + nx * AMPLITUDE * sign;
    const py = from.y + dy * tt + ny * AMPLITUDE * sign;
    d += ` L ${px} ${py}`;
  }
  d += ` L ${to.x} ${to.y}`;
  return d;
}
