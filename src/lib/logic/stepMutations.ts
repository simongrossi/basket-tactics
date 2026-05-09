import type { Annotation, AnnotationType, AttackerId, Point, Step } from '@/lib/types';

const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

function isMovement(a: Annotation): boolean {
  return MOVEMENT_TYPES.has(a.type);
}

function findMovementIdx(annotations: Annotation[], playerId: AttackerId): number {
  return annotations.findIndex((a) => isMovement(a) && a.fromId === playerId);
}

/**
 * Déplace `playerId` à `point` dans `Step[stepIdx]` et synchronise les
 * annotations de mouvement amont (Step[stepIdx-1]) et aval (Step[stepIdx]).
 *
 * - Étape 0 : reposition initiale, aucune annotation créée.
 * - Étape ≥ 1 : crée/update annotation sur Step[N-1]. Type auto :
 *   `dribble` si porteur sur Step[N-1], `cut` sinon. Conserve un `screen` existant.
 * - Si Step[N] a une annotation de mouvement du joueur, recale son `from`.
 */
export function setPlayerPositionAt(
  steps: Step[],
  stepIdx: number,
  playerId: AttackerId,
  point: Point,
): Step[] {
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  out[stepIdx].off[playerId] = point;

  // Amont : annotation sur Step[N-1]
  if (stepIdx >= 1) {
    const prev = out[stepIdx - 1];
    const idx = findMovementIdx(prev.annotations, playerId);
    if (idx >= 0) {
      const existing = prev.annotations[idx];
      prev.annotations[idx] = { ...existing, to: { ...point } };
    } else {
      const isCarrier = prev.ballCarrier === playerId;
      prev.annotations.push({
        type: isCarrier ? 'dribble' : 'cut',
        fromId: playerId,
        from: { ...prev.off[playerId] },
        to: { ...point },
      });
    }
  }

  // Aval : Step[N] annotation a un `from` à recaler
  const cur = out[stepIdx];
  const idxCur = findMovementIdx(cur.annotations, playerId);
  if (idxCur >= 0) {
    cur.annotations[idxCur] = { ...cur.annotations[idxCur], from: { ...point } };
  }

  return out;
}
