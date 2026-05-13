// Édition directe des points d'une annotation de mouvement (cut/dribble/screen).
//
// Trois opérations indépendantes — toutes pures :
//
//  - setAnnotationFrom : drag du point de départ. Équivaut à déplacer le joueur
//    à la position de DÉPART de l'action. Le moteur cascade automatiquement
//    via `setPlayerPositionAt` (annotation amont recalée, annotation aval du
//    même joueur recalée sur son `from`).
//
//  - setAnnotationTo : drag du point d'arrivée. Selon la phase de l'annotation,
//    on déplace soit la position du joueur à l'étape N+1 (phase 'end',
//    défaut) soit à l'étape N elle-même (phase 'start' — l'action est ACTIVE
//    dès le début de l'étape N, donc cur.off et next.off pointent tous deux
//    sur `to`).
//
//  - setAnnotationWaypoint : drag d'un point intermédiaire de courbe. Pas de
//    position joueur, pas de cascade — juste un hint visuel pour la spline.
//
// Règle 1 du projet : tout write de position joueur passe par push-out avec
// `PLAYER_MIN_CLEARANCE_PX` contre tous les autres joueurs actifs au step
// concerné. Les waypoints sont seulement clampés aux limites du terrain.

import type { AppState, Point, Step } from '@/lib/types';
import { COURT, FULL_COURT_INNER_MAX_Y, PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { clamp, pushOutOfMany } from '@/lib/logic/geometry';
import { activeOffense, getActiveAttackerIds, getActiveDefenderIds } from '@/lib/logic/players';
import { setPlayerPositionAt } from '@/lib/logic/stepMutations';

function clampToCourt(state: AppState, p: Point): Point {
  const maxY = state.fullCourt ? FULL_COURT_INNER_MAX_Y : COURT.innerMaxY;
  return {
    x: Math.round(clamp(p.x, COURT.marginX, COURT.innerMaxX)),
    y: Math.round(clamp(p.y, COURT.marginY, maxY)),
  };
}

/** Obstacles à éviter pour push-out d'un joueur donné à une étape donnée :
 *  tous les autres attaquants actifs + tous les défenseurs (override sinon
 *  position initiale). */
function obstaclesAtStep(
  state: AppState,
  stepIdx: number,
  excludePlayerId: string,
): Point[] {
  const step = state.steps[stepIdx];
  if (!step) return [];
  const offIds = getActiveAttackerIds(state.playerCount);
  const defIds = getActiveDefenderIds(state.playerCount);
  const off = activeOffense(step.off, state.playerCount);
  const out: Point[] = [];
  offIds.forEach((id) => {
    if (id === excludePlayerId) return;
    const p = off[id];
    if (p) out.push(p);
  });
  defIds.forEach((id) => {
    const p = step.defenseOverrides?.[id] ?? state.defenseInitial[id];
    if (p) out.push(p);
  });
  return out;
}

function safePoint(state: AppState, stepIdx: number, playerId: string, raw: Point): Point {
  const clamped = clampToCourt(state, raw);
  const obstacles = obstaclesAtStep(state, stepIdx, playerId);
  const pushed = pushOutOfMany(clamped, obstacles, PLAYER_MIN_CLEARANCE_PX);
  return { x: Math.round(pushed.x), y: Math.round(pushed.y) };
}

/** Déplace le point de DÉPART d'une annotation de mouvement.
 *  Équivaut à `moveAttackerInState` à l'étape `stepIdx` pour le joueur source.
 *  Cascade automatique sur l'annotation amont (Step[stepIdx-1].to) et aval
 *  du même joueur via `setPlayerPositionAt`. */
export function setAnnotationFrom(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  point: Point,
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  if (anno.type !== 'cut' && anno.type !== 'dribble' && anno.type !== 'screen') return s;
  const target = safePoint(s, stepIdx, anno.fromId, point);
  const steps = setPlayerPositionAt(s.steps, stepIdx, anno.fromId, target);
  return { ...s, steps };
}

/** Déplace le point d'ARRIVÉE d'une annotation de mouvement. La sémantique
 *  dépend de la phase :
 *
 *   - phase 'end' (défaut) : déplace `step[stepIdx+1].off[fromId]`. Le joueur
 *     arrive à `point` à la fin de l'étape stepIdx.
 *   - phase 'start' : déplace `step[stepIdx].off[fromId]` ET
 *     `step[stepIdx+1].off[fromId]`. Le joueur est déjà à `point` au début
 *     de l'étape stepIdx, puis y reste pendant la transition.
 *
 *  Push-out vs les autres joueurs au step où la position est écrite. */
export function setAnnotationTo(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  point: Point,
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  if (anno.type !== 'cut' && anno.type !== 'dribble' && anno.type !== 'screen') return s;

  const phase = anno.phase ?? 'end';
  if (phase === 'end') {
    if (stepIdx + 1 >= s.steps.length) {
      // Pas d'étape suivante — on update juste anno.to (rare : annotation sur
      // dernière étape sans aval, le upsert auto en aurait créé une).
      const steps = s.steps.map((st, i) =>
        i === stepIdx
          ? {
              ...st,
              annotations: st.annotations.map((a, j) =>
                j === annoIdx ? { ...a, to: clampToCourt(s, point) } : a,
              ),
            }
          : st,
      );
      return { ...s, steps };
    }
    const target = safePoint(s, stepIdx + 1, anno.fromId, point);
    const steps = setPlayerPositionAt(s.steps, stepIdx + 1, anno.fromId, target);
    return { ...s, steps };
  }

  // phase === 'start' — l'action est ACTIVE dès le début de stepIdx, le
  // joueur est à `to` sur stepIdx ET stepIdx+1. Update les deux.
  const targetStep = safePoint(s, stepIdx, anno.fromId, point);
  let steps = setPlayerPositionAt(s.steps, stepIdx, anno.fromId, targetStep);
  if (stepIdx + 1 < steps.length) {
    const targetNext = safePoint({ ...s, steps }, stepIdx + 1, anno.fromId, targetStep);
    steps = setPlayerPositionAt(steps, stepIdx + 1, anno.fromId, targetNext);
  }
  return { ...s, steps };
}

/** Déplace un waypoint intermédiaire d'une annotation de mouvement. Pas de
 *  cascade, pas de push-out : un waypoint est un hint de courbure, pas une
 *  position joueur. On clampe juste aux limites du terrain. */
export function setAnnotationWaypoint(
  s: AppState,
  stepIdx: number,
  annoIdx: number,
  wpIdx: number,
  point: Point,
): AppState {
  const step = s.steps[stepIdx];
  if (!step) return s;
  const anno = step.annotations[annoIdx];
  if (!anno) return s;
  if (anno.type !== 'cut' && anno.type !== 'dribble' && anno.type !== 'screen') return s;
  if (!anno.waypoints || wpIdx < 0 || wpIdx >= anno.waypoints.length) return s;

  const target = clampToCourt(s, point);
  const nextWaypoints = anno.waypoints.map((w, i) => (i === wpIdx ? target : w));
  const steps = s.steps.map((st, i) =>
    i === stepIdx
      ? {
          ...st,
          annotations: st.annotations.map((a, j) =>
            j === annoIdx ? { ...a, waypoints: nextWaypoints } : a,
          ),
        }
      : st,
  );
  return { ...s, steps };
}

// Type-only export pour `Step` afin d'éviter unused-import warnings — les
// transforms manipulent un AppState mais le module aval (transforms/index.ts)
// peut vouloir typer les retours intermédiaires.
export type { Step };
