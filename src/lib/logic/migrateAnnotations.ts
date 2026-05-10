import type { Annotation, AnnotationType, AttackerId, PlayerCount, Step } from '@/lib/types';
import { isActiveAttacker } from './players';

const EPSILON = 0.5;
const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

/**
 * Réconcilie les positions avec les annotations de mouvement existantes.
 *
 * Pour chaque transition Step[N] → Step[N+1] et chaque annotation de mouvement
 * sur Step[N] :
 *  - si Step[N+1].off[player] est INCHANGÉ (== Step[N].off[player]) ET que
 *    l'annotation pointe vers une destination différente,
 *  - alors on met à jour Step[N+1].off[player] = annotation.to
 *
 * Cas typique corrigé : l'utilisateur dessine une annotation "screen" ou
 * "cut" depuis l'étape N, mais Step[N+1] avait déjà été créé (ou copié) avec
 * la position d'origine et n'a pas été synchronisé. Sans ce fix, la lecture
 * en fin de timeline ramène le joueur à sa position initiale.
 *
 * Conservative : on ne touche QUE si la position de Step[N+1] est IDENTIQUE
 * à celle de Step[N]. Si le user a explicitement repositionné le joueur, on
 * respecte son choix.
 */
export function reconcileMovementAnnotations(steps: Step[]): Step[] {
  if (steps.length < 2) return steps;
  const out = steps.map((s) => ({ ...s, off: { ...s.off }, annotations: [...s.annotations] }));

  for (let n = 0; n < out.length - 1; n++) {
    const cur = out[n];
    const next = out[n + 1];
    for (const anno of cur.annotations) {
      if (!MOVEMENT_TYPES.has(anno.type)) continue;
      const id = anno.fromId;
      const curPos = cur.off[id];
      const nextPos = next.off[id];
      if (!curPos || !nextPos || !anno.to) continue;

      const nextUnchanged =
        Math.abs(nextPos.x - curPos.x) <= EPSILON && Math.abs(nextPos.y - curPos.y) <= EPSILON;
      const annoDifferent =
        Math.abs(anno.to.x - curPos.x) > EPSILON || Math.abs(anno.to.y - curPos.y) > EPSILON;
      if (nextUnchanged && annoDifferent) {
        next.off[id] = { x: anno.to.x, y: anno.to.y };
      }
    }
  }

  return out;
}

/**
 * Auto-génère les annotations de mouvement manquantes pour les scénarios legacy.
 *
 * Pour chaque transition Step[N] → Step[N+1] et chaque attaquant actif :
 * - si la position change (> EPSILON px),
 * - et qu'aucune annotation de mouvement de ce joueur n'existe sur Step[N],
 * - génère `dribble` si porteur sur Step[N], sinon `cut`.
 *
 * Idempotente. Ne touche jamais aux annotations existantes.
 */
export function ensureAnnotationsForMovement(
  steps: Step[],
  playerCount: PlayerCount,
): Step[] {
  if (steps.length < 2) return steps;
  const out = steps.map((s) => ({ ...s, annotations: [...s.annotations] }));

  for (let n = 0; n < out.length - 1; n++) {
    const cur = out[n];
    const next = out[n + 1];
    for (const id of ATTACKER_IDS) {
      if (!isActiveAttacker(id, playerCount)) continue;
      const a = cur.off[id];
      const b = next.off[id];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) <= EPSILON) continue;
      const hasMovement = cur.annotations.some(
        (an) => MOVEMENT_TYPES.has(an.type) && an.fromId === id,
      );
      if (hasMovement) continue;
      const type: AnnotationType = cur.ballCarrier === id ? 'dribble' : 'cut';
      const anno: Annotation = { type, fromId: id, from: { ...a }, to: { ...b } };
      cur.annotations.push(anno);
    }
  }

  return out;
}
