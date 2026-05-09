import type { Annotation, AnnotationType, AttackerId, Point, Step } from '@/lib/types';

// 'pass' exclu : une passe déplace le ballon, pas le corps du passeur.
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
 *
 * **Chaining contract** : ces helpers sont purs. Si le caller fait plusieurs
 * mutations sur la même séquence, il doit passer le retour de chaque appel
 * comme entrée du suivant. Réutiliser le `steps` original entre deux appels
 * lit des positions périmées.
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

/**
 * Insère ou remplace une annotation de mouvement (cut/dribble/screen) sur Step[stepIdx].
 * - Une seule annotation de mouvement par joueur par étape (contrainte invariante).
 * - `from` est toujours snappé à la position courante du joueur.
 * - Synchronise Step[stepIdx+1].off[fromId] = anno.to.
 * - Recale le `from` d'une éventuelle annotation de mouvement aval du même joueur.
 *
 * Voir le contrat de chaînage dans la JSDoc de `setPlayerPositionAt`.
 */
export function upsertMovementAnnotation(
  steps: Step[],
  stepIdx: number,
  anno: Annotation,
): Step[] {
  if (!isMovement(anno)) return steps;
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  const cur = out[stepIdx];
  const snappedFrom = { ...cur.off[anno.fromId] };
  const newAnno: Annotation = { ...anno, from: snappedFrom, to: { ...anno.to } };

  const existingIdx = findMovementIdx(cur.annotations, anno.fromId);
  if (existingIdx >= 0) {
    cur.annotations[existingIdx] = newAnno;
  } else {
    cur.annotations.push(newAnno);
  }

  if (stepIdx + 1 < out.length) {
    const next = out[stepIdx + 1];
    next.off[anno.fromId] = { ...newAnno.to };
    const nextIdx = findMovementIdx(next.annotations, anno.fromId);
    if (nextIdx >= 0) {
      next.annotations[nextIdx] = { ...next.annotations[nextIdx], from: { ...newAnno.to } };
    }
  }

  return out;
}

/**
 * Supprime l'annotation à `annoIdx` sur Step[stepIdx]. Si c'est une annotation
 * de mouvement, le joueur annule son mouvement : Step[stepIdx+1].off[player] = Step[stepIdx].off[player].
 * Cascade : recale le `from` d'une annotation de mouvement aval du même joueur.
 *
 * Voir le contrat de chaînage dans la JSDoc de `setPlayerPositionAt`.
 */
export function removeAnnotation(
  steps: Step[],
  stepIdx: number,
  annoIdx: number,
): Step[] {
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const cur = steps[stepIdx];
  if (annoIdx < 0 || annoIdx >= cur.annotations.length) return steps;
  const removed = cur.annotations[annoIdx];
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  out[stepIdx].annotations.splice(annoIdx, 1);

  if (isMovement(removed) && stepIdx + 1 < out.length) {
    const playerId = removed.fromId;
    const snapBack = { ...out[stepIdx].off[playerId] };
    out[stepIdx + 1].off[playerId] = snapBack;
    const nextIdx = findMovementIdx(out[stepIdx + 1].annotations, playerId);
    if (nextIdx >= 0) {
      out[stepIdx + 1].annotations[nextIdx] = {
        ...out[stepIdx + 1].annotations[nextIdx],
        from: snapBack,
      };
    }
  }

  return out;
}

/**
 * Ajoute une annotation `pass`. N'affecte pas les positions.
 */
export function upsertPassAnnotation(
  steps: Step[],
  stepIdx: number,
  anno: Annotation,
): Step[] {
  if (anno.type !== 'pass') return steps;
  if (stepIdx < 0 || stepIdx >= steps.length) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));
  out[stepIdx].annotations.push({ ...anno });
  return out;
}
