// Couche 1.4 — Ancre weak-side explicite (#8.2).
//
// Quand `state.weakSideAnchorEnabled`, désigne un défenseur ancre côté faible
// et l'enfonce vers la raquette (protection panier/skip), au lieu du sag
// passif distribué via helpPct. Position : à mi-chemin entre son homme et un
// point de protection raquette (sur la ligne homme→panier, à mi-raquette).
//
// Skip si le défenseur ancre est déjà engagé (pnrRole / onScreen) — sa tâche
// prime. `resolvePlayerCollisions` en aval garantit la clearance (Règle #0).

import type { DefenderId, Matchups, Point } from '../../types';
import { lerp } from '../geometry';
import { pickWeakSideAnchor } from './pickWeakSideAnchor';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Fraction d'enfoncement vers le point de protection raquette. */
const ANCHOR_SINK = 0.5;

export function applyWeakSideAnchorLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  if (!ctx.state.weakSideAnchorEnabled) return;
  const { off, ballCarrier, defenderIds, hoop, state } = ctx;

  const anchorId = pickWeakSideAnchor(
    off, ballCarrier, matchups, defenderIds, hoop,
    state.rules as Partial<Record<DefenderId, { weakSideAnchor?: boolean }>>,
  );
  if (!anchorId) return;

  const target = positions[anchorId];
  if (!target) return;
  // Ne pas écraser un défenseur déjà engagé.
  if (target.pnrRole || target.onScreen) return;

  const manId = matchups[anchorId];
  const manPos = off[manId];
  if (!manPos) return;

  // Point de protection raquette : sur la ligne homme→panier, à mi-raquette.
  const paintProtect: Point = lerp(manPos, hoop, 0.5);
  const sunk = lerp({ x: target.x, y: target.y }, paintProtect, ANCHOR_SINK);

  target.x = sunk.x;
  target.y = sunk.y;
  target.weakSideAnchor = true;
}
