import type { Annotation, AnnotationType, AttackerId, Point, Step } from '@/lib/types';
import { samplePolyline } from './polyline';

function annotationPolyline(ann: Annotation): Point[] {
  return ann.waypoints && ann.waypoints.length > 0
    ? [ann.from, ...ann.waypoints, ann.to]
    : [ann.from, ann.to];
}

export type MovementType = 'cut' | 'dribble' | 'screen' | 'idle';

export interface PlaybackTrajectory {
  position: Point;
  movementType: MovementType;
  isScreening: boolean;
}

const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

function findMovementAnnotation(step: Step, playerId: AttackerId): Annotation | null {
  return step.annotations.find(
    (a) => MOVEMENT_TYPES.has(a.type) && a.fromId === playerId,
  ) ?? null;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Pour le joueur `playerId` au step `stepIdx`, calcule sa position pendant
 * le segment vers Step[stepIdx+1] à `localT ∈ [0, 1]`.
 *
 * Trajectoires :
 * - aucune annotation de mouvement → idle (position constante).
 * - `cut` → ligne droite from → to.
 * - `dribble` → ligne droite from → to (la wave est purement visuelle, côté schéma).
 * - `screen` → vitesse double pour atteindre `to` à t=0.5, puis pinned ; isScreening=true à partir de t=0.5.
 *
 * NB : aucune logique d'évitement d'obstacles ici. CourtView l'applique en
 * couche pour `cut` uniquement.
 */
export function attackerTrajectoryAt(
  steps: Step[],
  stepIdx: number,
  playerId: AttackerId,
  localT: number,
): PlaybackTrajectory {
  const cur = steps[stepIdx];
  const fallback = cur.off[playerId];
  if (stepIdx + 1 >= steps.length) {
    return { position: { ...fallback }, movementType: 'idle', isScreening: false };
  }
  const ann = findMovementAnnotation(cur, playerId);
  if (!ann) {
    return { position: { ...fallback }, movementType: 'idle', isScreening: false };
  }
  const t = Math.max(0, Math.min(1, localT));
  const hasWaypoints = !!ann.waypoints && ann.waypoints.length > 0;
  if (ann.type === 'cut') {
    const position = hasWaypoints
      ? samplePolyline(annotationPolyline(ann), t)
      : lerp(ann.from, ann.to, t);
    return { position, movementType: 'cut', isScreening: false };
  }
  if (ann.type === 'dribble') {
    // Avec waypoints : trajectoire courbe lisse (l'utilisateur a explicitement
    // dessiné le dribble, on suit sa polyline). Sans waypoints : ligne droite —
    // la wave du schéma est une convention visuelle, le joueur ne la suit pas en lecture.
    const position = hasWaypoints
      ? samplePolyline(annotationPolyline(ann), t)
      : lerp(ann.from, ann.to, t);
    return { position, movementType: 'dribble', isScreening: false };
  }
  if (ann.type === 'screen') {
    if (t < 0.5) {
      const position = hasWaypoints
        ? samplePolyline(annotationPolyline(ann), t * 2)
        : lerp(ann.from, ann.to, t * 2);
      return { position, movementType: 'screen', isScreening: false };
    }
    return { position: { ...ann.to }, movementType: 'screen', isScreening: true };
  }
  return { position: { ...fallback }, movementType: 'idle', isScreening: false };
}
