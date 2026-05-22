// Routage défensif anticipé (D.4). Module pur : étant donné un point de
// départ, un point d'arrivée et des obstacles, produit un trajet lisse
// qui reste à >= clearance de chaque obstacle. Aucune dépendance React,
// déterministe, ne mute jamais ses entrées.

import type { Point } from '../types';
import { distance, pickBlockingCluster } from './geometry';

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
  return { waypoints: [{ ...from }, { ...to }], length: distance(from, to) };
}
