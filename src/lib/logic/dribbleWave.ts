import type { Point } from '@/lib/types';

// Amplitude du point de contrôle Bezier (pic). Le sommet visuel de la courbe
// quadratique passe à ~AMPLITUDE/2 de l'axe — pour une wave perçue ~5 px,
// on met AMPLITUDE=10 sur le contrôle.
const AMPLITUDE = 10;
const WAVELENGTH = 14;

interface Geometry {
  from: Point;
  to: Point;
  dx: number;
  dy: number;
  /** Vecteur normal unitaire (perpendiculaire à l'axe principal). */
  nx: number;
  ny: number;
  /** Nombre de sous-segments le long de l'axe (= nb de pics + 1). */
  segs: number;
}

function geometry(from: Point, to: Point): Geometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    from, to, dx, dy,
    nx: -dy / len,
    ny: dx / len,
    segs: Math.max(4, Math.round(len / WAVELENGTH)),
  };
}

/** Pic i (i ∈ [1, segs-1]) : point de contrôle Bezier perpendiculaire à l'axe. */
function peak(g: Geometry, i: number): Point {
  const tt = i / g.segs;
  const sign = i % 2 === 0 ? 1 : -1;
  return {
    x: g.from.x + g.dx * tt + g.nx * AMPLITUDE * sign,
    y: g.from.y + g.dy * tt + g.ny * AMPLITUDE * sign,
  };
}

/** Mid entre pic[i] et pic[i+1] (sur l'axe principal, sans offset). Sert de
 *  jonction C1 entre deux courbes quadratiques consécutives. */
function midOnAxis(g: Geometry, i: number): Point {
  const tt = (i + 0.5) / g.segs;
  return { x: g.from.x + g.dx * tt, y: g.from.y + g.dy * tt };
}

/**
 * Échantillonne la position du porteur le long de la wave de dribble
 * à un instant `t ∈ [0, 1]`. Reproduit exactement la géométrie du tracé SVG
 * (chaîne de courbes quadratiques Bezier).
 */
export function sampleDribbleWave(from: Point, to: Point, t: number): Point {
  if (t <= 0) return { x: from.x, y: from.y };
  if (t >= 1) return { x: to.x, y: to.y };
  const g = geometry(from, to);
  // segs sous-segments d'axe → (segs-1) pics → (segs-1) courbes Q chainées.
  const numQ = g.segs - 1;
  if (numQ <= 0) {
    return { x: from.x + g.dx * t, y: from.y + g.dy * t };
  }
  const seg = t * numQ;
  const k = Math.min(numQ - 1, Math.floor(seg));
  const localT = seg - k;
  const p0 = k === 0 ? g.from : midOnAxis(g, k);
  const p1 = peak(g, k + 1);
  const p2 = k === numQ - 1 ? g.to : midOnAxis(g, k + 1);
  const u = 1 - localT;
  return {
    x: u * u * p0.x + 2 * u * localT * p1.x + localT * localT * p2.x,
    y: u * u * p0.y + 2 * u * localT * p1.y + localT * localT * p2.y,
  };
}

/**
 * Génère le chemin SVG `d="..."` correspondant à la wave de dribble : une
 * chaîne de courbes quadratiques Bezier (`Q`) lissées entre les pics, avec
 * jonctions C1 sur l'axe pour éviter l'effet zigzag d'une polyligne.
 */
export function dribbleWavePath(from: Point, to: Point): string {
  const g = geometry(from, to);
  const numQ = g.segs - 1;
  if (numQ <= 0) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  let d = `M ${from.x} ${from.y}`;
  for (let k = 0; k < numQ; k++) {
    const p1 = peak(g, k + 1);
    const p2 = k === numQ - 1 ? g.to : midOnAxis(g, k + 1);
    d += ` Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
  }
  return d;
}
