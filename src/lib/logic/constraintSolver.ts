import type { Point } from '@/lib/types';

export interface PointObstacleConstraint {
  center: Point;
  minDist?: number;
}

export interface HalfPlaneConstraint {
  /** Point sur la ligne qui sépare les deux demi-plans. */
  origin: Point;
  /** Normale de la ligne. Elle est normalisée par le solveur. */
  normal: Point;
  /** Côté autorisé : `dot(point - origin, normal) * sign >= 0`. */
  sign: -1 | 1;
}

export interface SolvePointConstraintsParams {
  point: Point;
  obstacles: PointObstacleConstraint[];
  defaultMinDist: number;
  iterations?: number;
  halfPlane?: HalfPlaneConstraint;
  fallbackDirection?: Point;
}

export interface SolvePointConstraintsResult {
  point: Point;
  moved: boolean;
  iterations: number;
}

export interface CollisionEntity<Id extends string = string> {
  id: Id;
  point: Point;
  fixed?: boolean;
  fallbackDirection?: Point;
}

export interface SolveEntityCollisionsParams<Id extends string = string> {
  entities: Array<CollisionEntity<Id>>;
  staticObstacles?: PointObstacleConstraint[];
  defaultMinDist: number;
  iterations?: number;
  epsilon?: number;
}

export interface SolveEntityCollisionsResult<Id extends string = string> {
  positions: Partial<Record<Id, Point>>;
  movedIds: Set<Id>;
  iterations: number;
}

/**
 * Projection itérative d'un point hors d'une liste d'obstacles, avec
 * contrainte optionnelle de demi-plan. C'est le socle commun avant de
 * remplacer progressivement les push-out locaux du moteur d'écran.
 */
export function solvePointConstraints(
  params: SolvePointConstraintsParams
): SolvePointConstraintsResult {
  const halfPlane = normalizeHalfPlane(params.halfPlane);
  const fallback = normalizeVector(params.fallbackDirection) ??
    (halfPlane ? { x: halfPlane.normal.x * halfPlane.sign, y: halfPlane.normal.y * halfPlane.sign } : { x: 1, y: 0 });
  const maxIter = params.iterations ?? 5;
  // La contrainte de demi-plan s'applique aux corrections de collision,
  // pas au point initial. C'est important pour préserver le comportement
  // historique de `pushOutOfScreenContact`: un défenseur déjà stable de
  // l'autre côté ne doit pas être mirrorré sans chevauchement actif.
  let result = params.point;
  let moved = false;
  let usedIterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    let iterMoved = false;
    usedIterations = iter + 1;
    for (const obstacle of params.obstacles) {
      const minDist = obstacle.minDist ?? params.defaultMinDist;
      const next = projectObstacle(result, obstacle.center, minDist, fallback, halfPlane);
      if (distanceSquared(next, result) > 0.000001) {
        result = next;
        iterMoved = true;
        moved = true;
      }
    }
    if (!iterMoved) break;
  }

  return { point: result, moved, iterations: usedIterations };
}

/**
 * Résout un ensemble d'entités mobiles contre des obstacles fixes et les
 * autres entités. Les entités `fixed` restent des obstacles solides mais ne
 * sont pas déplacées. C'est le solveur commun pour les collisions finales
 * du playback et les futures contraintes screen-lock.
 */
export function solveEntityCollisions<Id extends string = string>(
  params: SolveEntityCollisionsParams<Id>
): SolveEntityCollisionsResult<Id> {
  const maxIter = params.iterations ?? 8;
  const epsilon = params.epsilon ?? 0.5;
  const positions: Partial<Record<Id, Point>> = {};
  params.entities.forEach((entity) => {
    positions[entity.id] = { x: entity.point.x, y: entity.point.y };
  });

  const movedIds = new Set<Id>();
  let usedIterations = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    let anyMoved = false;
    usedIterations = iter + 1;
    for (const entity of params.entities) {
      if (entity.fixed) continue;
      const current = positions[entity.id];
      if (!current) continue;
      const obstacles: PointObstacleConstraint[] = [
        ...(params.staticObstacles ?? []),
      ];
      for (const other of params.entities) {
        if (other.id === entity.id) continue;
        const otherPoint = positions[other.id];
        if (otherPoint) obstacles.push({ center: otherPoint });
      }

      const solved = solvePointConstraints({
        point: current,
        obstacles,
        defaultMinDist: params.defaultMinDist,
        fallbackDirection: entity.fallbackDirection,
      }).point;
      if (distanceSquared(solved, current) > epsilon * epsilon) {
        positions[entity.id] = solved;
        movedIds.add(entity.id);
        anyMoved = true;
      }
    }
    if (!anyMoved) break;
  }

  return { positions, movedIds, iterations: usedIterations };
}

function projectObstacle(
  point: Point,
  obstacle: Point,
  minDist: number,
  fallbackDirection: Point,
  halfPlane: NormalizedHalfPlane | undefined
): Point {
  const dx = point.x - obstacle.x;
  const dy = point.y - obstacle.y;
  const d = Math.hypot(dx, dy);
  if (d >= minDist) return point;

  const direction = d < 0.01
    ? fallbackDirection
    : { x: dx / d, y: dy / d };
  const candidate = {
    x: obstacle.x + direction.x * minDist,
    y: obstacle.y + direction.y * minDist,
  };
  return projectHalfPlane(candidate, halfPlane);
}

interface NormalizedHalfPlane {
  origin: Point;
  normal: Point;
  sign: -1 | 1;
}

function normalizeHalfPlane(
  halfPlane: HalfPlaneConstraint | undefined
): NormalizedHalfPlane | undefined {
  if (!halfPlane) return undefined;
  const normal = normalizeVector(halfPlane.normal);
  if (!normal) return undefined;
  return { origin: halfPlane.origin, normal, sign: halfPlane.sign };
}

function projectHalfPlane(point: Point, halfPlane: NormalizedHalfPlane | undefined): Point {
  if (!halfPlane) return point;
  const side = signedHalfPlaneDistance(point, halfPlane);
  if (side * halfPlane.sign >= 0) return point;
  return {
    x: point.x - 2 * side * halfPlane.normal.x,
    y: point.y - 2 * side * halfPlane.normal.y,
  };
}

function signedHalfPlaneDistance(point: Point, halfPlane: NormalizedHalfPlane): number {
  return (
    (point.x - halfPlane.origin.x) * halfPlane.normal.x +
    (point.y - halfPlane.origin.y) * halfPlane.normal.y
  );
}

function normalizeVector(vector: Point | undefined): Point | undefined {
  if (!vector) return undefined;
  const len = Math.hypot(vector.x, vector.y);
  if (len < 0.01) return undefined;
  return { x: vector.x / len, y: vector.y / len };
}

function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
