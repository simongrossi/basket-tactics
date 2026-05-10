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

  // Sélection de l'annotation active : on regarde l'annotation sur step idxA
  // (par défaut) ET sur step idxA+1 (au cas où elle ait tStart < 0 et déborde
  // dans la transition courante). On choisit celle dont la fenêtre temporelle
  // contient le globalT courant.
  const globalT = stepIdx + Math.max(0, Math.min(1, localT));
  type Candidate = { ann: Annotation; absStart: number; absEnd: number };
  const candidates: Candidate[] = [];
  for (const checkIdx of [stepIdx, stepIdx + 1]) {
    if (checkIdx < 0 || checkIdx >= steps.length) continue;
    const a = findMovementAnnotation(steps[checkIdx], playerId);
    if (!a) continue;
    const tSraw = a.tStart ?? 0;
    const tEraw = a.tEnd ?? 1;
    const absStart = checkIdx + tSraw;
    const absEnd = checkIdx + tEraw;
    // Ne garder que si la fenêtre chevauche la transition courante [stepIdx, stepIdx+1]
    if (absEnd <= stepIdx || absStart >= stepIdx + 1) continue;
    candidates.push({ ann: a, absStart, absEnd });
  }

  if (candidates.length === 0) {
    return { position: { ...fallback }, movementType: 'idle', isScreening: false };
  }

  const active = candidates.find((c) => globalT >= c.absStart && globalT <= c.absEnd);
  let chosen: Candidate;
  let actionT: number;
  if (active) {
    chosen = active;
    actionT = (globalT - active.absStart) / Math.max(0.001, active.absEnd - active.absStart);
  } else {
    // Pas dans la fenêtre active : on prend la candidate la plus pertinente
    // (la première par absStart) et on snap aux extrémités.
    chosen = candidates.sort((a, b) => a.absStart - b.absStart)[0];
    if (globalT < chosen.absStart) actionT = 0;
    else actionT = 1;
  }
  const ann = chosen.ann;

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
