import type { Annotation, AnnotationType, AttackerId, PlayerCount, Step } from '@/lib/types';
import { isActiveAttacker } from './players';

const EPSILON = 0.5;
const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

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
