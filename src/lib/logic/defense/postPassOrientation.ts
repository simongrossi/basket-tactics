// Couche 6 — Recalcul d'orientation final après tous les ajustements (PnR,
// off-ball, trap, switch, directives). On part de la position FINALE et
// du `pnrRole` effectif. Sinon le low-man tag pointerait encore vers son
// homme original au lieu de la zone de menace.
//
// Note : c'est sémantiquement la même opération que
// `recomputeDefenseFrameOrientations` dans frameAdjust.ts, mais opérant sur
// `DefenderTarget` (sortie de computeDefenseTargets) au lieu de
// `ComputedDefense` (sortie de effectiveDefensePositions). On garde les deux
// séparés tant que les types ne sont pas unifiés.

import type { DefenderId } from '../../types';
import { computeDefenderOrientation } from '../orientation';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyPostPassOrientationLayer(
  positions: Record<DefenderId, DefenderTarget>,
  ctx: DefenseFrameContext
): void {
  const { state, off, carrierPos, defenderIds } = ctx;
  defenderIds.forEach((dId) => {
    const slot = positions[dId];
    if (!slot) return;
    const att = off[slot.matchedTo];
    const rule = state.rules[dId];
    if (!rule) return;
    const recomputed = computeDefenderOrientation({
      defenderPos: { x: slot.x, y: slot.y },
      manPos: att ?? { x: slot.x, y: slot.y },
      ballPos: carrierPos,
      isCarrierDefender: slot.isCarrierDefender,
      stance: rule.offBallStance,
      vsCarrier: rule.vsCarrier,
      pnrRole: slot.pnrRole,
      manualDelta: rule.orientation ?? 0,
      manualBody: rule.bodyOrientation,
      bodyMode: rule.bodyOrientationMode,
      gazeLock: rule.gazeLock,
    });
    slot.orientation = recomputed.bodyOrientation;
    slot.gazeOrientation = recomputed.gazeOrientation;
    slot.facing = recomputed.facing;
    slot.armBallSide = recomputed.armBallSide;
    slot.armManSide = recomputed.armManSide;
  });
}
