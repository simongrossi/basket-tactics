// Couche 1.2 (2a — défense vivante / drive) — containment du drive.
//
// Après baseTargets : si le porteur drive et que son défenseur peut
// atteindre le point de contain à temps (verdict contained/walled), on
// glisse la cible du défenseur du porteur vers ce point (cap dur). Si le
// défenseur est battu (beaten) on ne fait rien (en retard = réaliste).
//
// N'altère QUE le défenseur du porteur. Opt-in via state.driveContainmentEnabled.
// La clearance Rule 1 est garantie en aval par resolvePlayerCollisions.

import type { DefenderId, Matchups } from '../../types';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import { evaluateDriveContainment, containmentSpeed } from '../driveContainment';
import { CONTAINMENT_MAX_SHIFT_PX } from './constants';

export { CONTAINMENT_MAX_SHIFT_PX };

export function applyDriveContainmentLayer(
  positions: Record<DefenderId, DefenderTarget>,
  _matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  if (!ctx.state.driveContainmentEnabled) return;

  const { defenderIds, carrierPos, ballCarrier, hoop, prevOff, state } = ctx;

  const carrierDef = defenderIds.find((dId) => positions[dId]?.isCarrierDefender);
  if (!carrierDef) return;
  const def = positions[carrierDef];

  const carrierPrev = prevOff?.[ballCarrier] ?? null;
  const base = state.defenseMaxSpeed;

  const result = evaluateDriveContainment({
    carrier: carrierPos,
    carrierPrev,
    defender: { x: def.x, y: def.y },
    hoop,
    carrierSpeed: containmentSpeed(state.attackerSpeedProfiles?.[ballCarrier], base),
    defenderSpeed: containmentSpeed(state.defenderSpeedProfiles?.[carrierDef], base),
  });

  if (!result.isDriving) return;
  if (result.level === 'beaten') return;

  const dx = result.containPoint.x - def.x;
  const dy = result.containPoint.y - def.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const shift = Math.min(d, CONTAINMENT_MAX_SHIFT_PX);
  def.x += (dx / d) * shift;
  def.y += (dy / d) * shift;
}
