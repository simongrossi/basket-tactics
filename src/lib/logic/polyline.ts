import type { Point } from '@/lib/types';

/**
 * Polyline lissée par spline Catmull-Rom (tension τ = 0.5, uniforme).
 *
 * Point d'entrée commun pour les trajectoires courbes des annotations :
 *  - rendu SVG (`polylinePath`) : path `M ... C ...` lisse, équivalent
 *    Bezier cubique exact des segments Catmull-Rom.
 *  - interpolation runtime (`samplePolyline`) : position le long de la
 *    spline à `t ∈ [0, 1]`, avec longueur d'arc reparamétrée linéairement
 *    via les distances euclidiennes des segments — le joueur avance à
 *    vitesse perçue constante, ce qui rend les aller-retour (V-cut) lisibles.
 *
 * Convention : `points` est la polyline complète, incluant le premier et
 * le dernier point (= `from` et `to` de l'annotation, avec les waypoints
 * intercalés entre les deux).
 */

const TENSION = 0.5;

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Conversion Catmull-Rom (uniforme, τ=0.5) → Bezier cubique : 4 points
 *  de contrôle qui décrivent exactement le même segment de courbe. */
function catmullRomToBezier(p0: Point, p1: Point, p2: Point, p3: Point): {
  c1: Point; c2: Point;
} {
  const k = 1 / (6 * TENSION);
  return {
    c1: { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k },
    c2: { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k },
  };
}

/** Évaluation Bezier cubique à `t ∈ [0, 1]`. */
function bezierCubic(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  const u3 = u2 * u;
  const t3 = t2 * t;
  return {
    x: u3 * p0.x + 3 * u2 * t * c1.x + 3 * u * t2 * c2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * c1.y + 3 * u * t2 * c2.y + t3 * p3.y,
  };
}

/**
 * Génère le path SVG (`d` attribute) d'une polyline lissée par Catmull-Rom.
 * Les segments aux extrémités utilisent une réflexion miroir des contrôles
 * pour éviter qu'ils ne s'aplatissent (premier/dernier sans tangente).
 */
export function polylinePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x} ${points[0].y}`;
  if (n === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < n ? points[i + 2] : points[i + 1];
    const { c1, c2 } = catmullRomToBezier(p0, p1, p2, p3);
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Échantillonne une position le long de la polyline lissée à `t ∈ [0, 1]`.
 * Reparamétrage linéaire via les longueurs des segments euclidiens entre
 * waypoints — vitesse perçue ~constante en lecture, indépendante de la
 * courbure. Le résultat reste sur la même courbe que le path rendu via
 * `polylinePath` (mêmes Bezier cubiques).
 */
export function samplePolyline(points: Point[], t: number): Point {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { ...points[0] };
  if (t <= 0) return { ...points[0] };
  if (t >= 1) return { ...points[n - 1] };
  if (n === 2) {
    return {
      x: points[0].x + (points[1].x - points[0].x) * t,
      y: points[0].y + (points[1].y - points[0].y) * t,
    };
  }

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < n - 1; i++) {
    const dseg = dist(points[i], points[i + 1]);
    segLengths.push(dseg);
    totalLen += dseg;
  }
  if (totalLen < 1e-6) return { ...points[0] };

  const targetLen = t * totalLen;
  let acc = 0;
  let segIdx = 0;
  let segT = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (acc + len >= targetLen) {
      segIdx = i;
      segT = len < 1e-6 ? 0 : (targetLen - acc) / len;
      break;
    }
    acc += len;
  }

  const p0 = segIdx === 0 ? points[0] : points[segIdx - 1];
  const p1 = points[segIdx];
  const p2 = points[segIdx + 1];
  const p3 = segIdx + 2 < n ? points[segIdx + 2] : points[segIdx + 1];
  const { c1, c2 } = catmullRomToBezier(p0, p1, p2, p3);
  return bezierCubic(p1, c1, c2, p2, segT);
}

/**
 * Simplification Douglas-Peucker : réduit une polyline en gardant
 * uniquement les sommets dont la distance perpendiculaire à la corde
 * englobante dépasse `tolerance`. Préserve `from` et `to` (extrémités).
 *
 * Utilisé pour transformer un drag freehand (1 point par pointermove,
 * souvent 50–200 points) en une polyline propre de 3–7 waypoints qui
 * décrit l'intention de l'utilisateur sans bruit.
 */
export function simplifyPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last - first <= 1) continue;

    let maxDist = 0;
    let maxIdx = first;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      keep[maxIdx] = true;
      stack.push([first, maxIdx], [maxIdx, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(p, a);
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(len2);
}
