// Phase Motion — auto-replacement : cascade de fill (fill-from-behind)
// déclenchée quand un cut/drive vide un spot périmètre. Purs. Voir
// docs/superpowers/specs/2026-06-02-auto-replacement-design.md.

import type { AttackerId, AttackerPositions, OffensiveScriptedAction, Point, Step } from '../../types';
import { COURT_CENTERLINE_X, PLAYER_MIN_CLEARANCE_PX } from '../../data/court';
import { distance, distHoop, pushOutOfMany } from '../geometry';

/** Actions qui vident un spot périmètre vers le panier. */
const TRIGGER_TYPES = new Set(['basket-cut', 'backdoor-cut', 'flash-cut', 'give-and-go', 'drive']);

export function isReplacementTrigger(type: string): boolean {
  return TRIGGER_TYPES.has(type);
}

/** Identifie le joueur qui coupe selon le type d'action. */
export function replacementCutterId(action: OffensiveScriptedAction): AttackerId | null {
  switch (action.type) {
    case 'give-and-go': return action.params.giver ?? null;
    case 'drive': return action.params.driver ?? null;
    default: return action.params.cutter ?? null;
  }
}

export interface Relocation {
  player: AttackerId;
  target: Point;
}

function sameSide(a: Point, b: Point): boolean {
  return Math.sign(a.x - COURT_CENTERLINE_X) === Math.sign(b.x - COURT_CENTERLINE_X);
}

/** Le filler = coéquipier ∉ excluded, MÊME CÔTÉ que `vacated`, PLUS LOIN du
 *  panier, et le plus proche du spot. null si aucun (cascade s'arrête). */
export function pickFiller(
  prevOff: AttackerPositions,
  vacated: Point,
  excluded: Set<AttackerId>,
  active: AttackerId[],
): AttackerId | null {
  let best: AttackerId | null = null;
  let bestDist = Infinity;
  for (const p of active) {
    if (excluded.has(p)) continue;
    const pos = prevOff[p];
    if (!pos) continue;
    if (!sameSide(pos, vacated)) continue;
    if (distHoop(pos) <= distHoop(vacated)) continue;
    const d = distance(pos, vacated);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** Cascade fill-from-behind : le spot du cutter est comblé par le joueur derrière
 *  (même côté, plus haut), dont la place devient le spot suivant. Bornée à
 *  `depth` (clampé 1…4) + arrêt naturel. Le porteur ne comble jamais. */
export function computeReplacementChain(
  prevOff: AttackerPositions,
  cutterId: AttackerId,
  ballCarrierId: AttackerId,
  active: AttackerId[],
  depth: number,
): Relocation[] {
  const start = prevOff[cutterId];
  if (!start) return [];
  const maxDepth = Math.max(1, Math.min(4, Math.floor(depth)));
  const relocations: Relocation[] = [];
  const excluded = new Set<AttackerId>([cutterId, ballCarrierId]);
  let vacated = start;
  for (let d = 0; d < maxDepth; d++) {
    const filler = pickFiller(prevOff, vacated, excluded, active);
    if (!filler) break;
    relocations.push({ player: filler, target: vacated });
    excluded.add(filler);
    vacated = prevOff[filler];
  }
  return relocations;
}

/** Fusionne les positions des fillers dans le step (concurrent). Chaque cible
 *  passe par pushOutOfMany contre les AUTRES joueurs déjà placés → Règle 1. */
export function applyReplacementToStep(step: Step, relocations: Relocation[]): Step {
  if (relocations.length === 0) return step;
  const off: AttackerPositions = { ...step.off };
  for (const { player, target } of relocations) {
    const others: Point[] = (Object.keys(off) as AttackerId[])
      .filter((id) => id !== player)
      .map((id) => off[id]);
    off[player] = pushOutOfMany(target, others, PLAYER_MIN_CLEARANCE_PX);
  }
  return { ...step, off };
}
