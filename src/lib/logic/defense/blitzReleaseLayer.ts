// Couche 2.6 — Relâche du blitz (#8.1).
//
// Quand le ballon ressort d'un blitz (detectBlitzRelease), les 2 trappeurs
// récupèrent : le screenerDef prend le roller (la menace n°1), le carrierDef
// garde sa cible homme naturelle. Les deux sont flaggés blitzRecovering pour
// l'easing de relâche (frameResolver) + le badge visuel.
//
// Opt-in via state.blitzReleaseEnabled. `resolvePlayerCollisions` en aval
// garantit la clearance (Règle #0).

import type { DefenderId, Matchups } from '../../types';
import { detectBlitzRelease } from './detectBlitzRelease';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Offset du screenerDef par rapport au roller, côté panier (comme le tag PnR). */
const ROLLER_TAG_OFFSET = 30;

export function applyBlitzReleaseLayer(
  positions: Record<DefenderId, DefenderTarget>,
  _matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  if (!ctx.state.blitzReleaseEnabled) return;

  const release = detectBlitzRelease(ctx.state, ctx.stepIdx);
  if (!release) return;

  const { off, hoop } = ctx;
  const { carrierDefId, screenerDefId, rollerId } = release;

  // screenerDef récupère le roller : cible homme-à-homme entre roller et panier.
  const screenerTarget = positions[screenerDefId];
  const rollerPos = off[rollerId];
  if (screenerTarget && rollerPos) {
    const dx = hoop.x - rollerPos.x;
    const dy = hoop.y - rollerPos.y;
    const len = Math.hypot(dx, dy) || 1;
    screenerTarget.x = Math.round(rollerPos.x + (dx / len) * ROLLER_TAG_OFFSET);
    screenerTarget.y = Math.round(rollerPos.y + (dy / len) * ROLLER_TAG_OFFSET);
    screenerTarget.matchedTo = rollerId;
    screenerTarget.blitzRecovering = true;
  }

  // carrierDef : garde sa cible naturelle (déjà calculée), juste flaggé.
  const carrierTarget = positions[carrierDefId];
  if (carrierTarget) {
    carrierTarget.blitzRecovering = true;
  }
}
