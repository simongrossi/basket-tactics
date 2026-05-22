// Routage défensif anticipé (D.4). Module pur : étant donné un point de
// départ, un point d'arrivée et des obstacles, produit un trajet lisse
// qui reste à >= clearance de chaque obstacle. Aucune dépendance React,
// déterministe, ne mute jamais ses entrées.

import type { Point } from '../types';
import { distance, pickBlockingCluster, pointToSegmentDistance } from './geometry';
import { samplePolyline } from './polyline';

/** Obstacle ponctuel : centre + rayon d'exclusion (clearance). */
export interface RouteObstacle {
  center: Point;
  radius: number;
}

/** Trajet calculé : polyligne de waypoints + longueur cumulée. */
export interface DefensiveRoute {
  /** [from, ...detour, to]. 2 points = trajet droit. */
  waypoints: Point[];
  /** Somme des distances euclidiennes entre waypoints. */
  length: number;
}

/** Marge ajoutée au rayon du cluster pour placer le waypoint de détour. */
export const DEFENSIVE_ROUTE_BUFFER_PX = 4;

/** Somme des distances euclidiennes entre waypoints consécutifs. */
function routeLength(waypoints: Point[]): number {
  let len = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    len += distance(waypoints[i], waypoints[i + 1]);
  }
  return len;
}

/** Pas d'escalade de l'offset du waypoint quand la route raze l'obstacle. */
export const DEFENSIVE_ROUTE_OFFSET_STEP_PX = 8;

/** En-deçà de cette pénétration (px), une route est considérée dégagée. */
export const ROUTE_CLEAR_EPSILON_PX = 0.01;

/** Pénétration max d'une route candidate dans les obstacles (0 = dégagée). */
function maxPenetration(waypoints: Point[], obstacles: RouteObstacle[]): number {
  let worst = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    for (const o of obstacles) {
      const d = pointToSegmentDistance(o.center, waypoints[i], waypoints[i + 1]);
      const pen = o.radius - d;
      if (pen > worst) worst = pen;
    }
  }
  return worst;
}

/**
 * Construit la meilleure route d'un côté donné du cluster (`sign` = +1
 * gauche, -1 droite). Escalade l'offset du waypoint depuis
 * `cluster.radius + buffer` : un waypoint trop proche laisse les segments
 * de la polyligne razer l'obstacle. On éloigne le waypoint par pas jusqu'à
 * une route dégagée, ou jusqu'au plafond `cluster.radius * 3 + buffer`.
 */
function buildSideRoute(
  from: Point,
  to: Point,
  cluster: { center: Point; radius: number },
  perp: Point,
  sign: number,
  obstacles: RouteObstacle[],
): { waypoints: Point[]; length: number; penetration: number } {
  const maxOffset = cluster.radius * 3 + DEFENSIVE_ROUTE_BUFFER_PX;
  let best: Point[] | null = null;
  let bestPen = Infinity;
  for (
    let offset = cluster.radius + DEFENSIVE_ROUTE_BUFFER_PX;
    offset <= maxOffset;
    offset += DEFENSIVE_ROUTE_OFFSET_STEP_PX
  ) {
    const wp: Point = {
      x: cluster.center.x + perp.x * sign * offset,
      y: cluster.center.y + perp.y * sign * offset,
    };
    const route: Point[] = [{ ...from }, wp, { ...to }];
    const pen = maxPenetration(route, obstacles);
    if (pen < bestPen) {
      bestPen = pen;
      best = route;
    }
    if (pen <= ROUTE_CLEAR_EPSILON_PX) break;
  }
  const waypoints = best as Point[];
  return { waypoints, length: routeLength(waypoints), penetration: bestPen };
}

export function computeDefensiveRoute(
  from: Point,
  to: Point,
  obstacles: RouteObstacle[],
): DefensiveRoute {
  if (distance(from, to) < 1e-3) {
    return { waypoints: [{ ...from }, { ...to }], length: 0 };
  }
  const cluster = pickBlockingCluster(from, to, obstacles);
  if (!cluster) {
    return { waypoints: [{ ...from }, { ...to }], length: distance(from, to) };
  }

  // Perpendiculaire unitaire au segment from→to.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const perp: Point = { x: -dy / len, y: dx / len };

  // 2 routes candidates : détour à gauche (sign +1) et à droite (sign -1).
  const left = buildSideRoute(from, to, cluster, perp, 1, obstacles);
  const right = buildSideRoute(from, to, cluster, perp, -1, obstacles);

  // Préférer une route dégagée ; parmi les dégagées, la plus courte.
  // Tie-break déterministe : gauche calculée en premier, `<` strict.
  const clean = [left, right].filter((r) => r.penetration <= ROUTE_CLEAR_EPSILON_PX);
  let chosen: { waypoints: Point[]; length: number };
  if (clean.length > 0) {
    chosen = clean.reduce((a, b) => (b.length < a.length ? b : a));
  } else {
    // Dégradation gracieuse : aucune route dégagée → moindre pénétration.
    chosen = left.penetration <= right.penetration ? left : right;
  }
  return { waypoints: chosen.waypoints, length: chosen.length };
}

/**
 * Échantillonne la route à `t ∈ [0, 1]`. Délègue à `samplePolyline` :
 * lissage Catmull-Rom + reparamétrage en longueur d'arc (vitesse perçue
 * constante quelle que soit la courbure).
 */
export function sampleRoute(route: DefensiveRoute, t: number): Point {
  return samplePolyline(route.waypoints, t);
}
