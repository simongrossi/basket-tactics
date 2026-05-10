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
 * Édition continue (Étape 10) : si l'annotation porte `tStart`/`tEnd`
 * (0..1), l'action n'occupe que [tStart, tEnd] dans le segment. Avant tStart
 * le joueur est à anno.from, après tEnd à anno.to. Cela permet à plusieurs
 * actions parallèles d'avoir des durées différentes (un écran rapide à
 * [0, 0.4], un dribble plus long [0.3, 1.0], etc.).
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

  // Mapping du temps global du segment [0,1] vers le temps DE L'ACTION [0,1]
  // selon les bornes tStart/tEnd de l'annotation. Avant tStart → 0 (joueur
  // au from), après tEnd → 1 (joueur au to).
  const t = Math.max(0, Math.min(1, localT));
  const tS = Math.max(0, Math.min(1, ann.tStart ?? 0));
  const tE = Math.max(tS, Math.min(1, ann.tEnd ?? 1));
  let actionT: number;
  if (t <= tS) actionT = 0;
  else if (t >= tE) actionT = 1;
  else actionT = (t - tS) / Math.max(0.001, tE - tS);

  const hasWaypoints = !!ann.waypoints && ann.waypoints.length > 0;
  if (ann.type === 'cut') {
    const position = hasWaypoints
      ? samplePolyline(annotationPolyline(ann), actionT)
      : lerp(ann.from, ann.to, actionT);
    return { position, movementType: 'cut', isScreening: false };
  }
  if (ann.type === 'dribble') {
    const position = hasWaypoints
      ? samplePolyline(annotationPolyline(ann), actionT)
      : lerp(ann.from, ann.to, actionT);
    return { position, movementType: 'dribble', isScreening: false };
  }
  if (ann.type === 'screen') {
    if (actionT < 0.5) {
      const position = hasWaypoints
        ? samplePolyline(annotationPolyline(ann), actionT * 2)
        : lerp(ann.from, ann.to, actionT * 2);
      return { position, movementType: 'screen', isScreening: false };
    }
    return { position: { ...ann.to }, movementType: 'screen', isScreening: true };
  }
  return { position: { ...fallback }, movementType: 'idle', isScreening: false };
}
