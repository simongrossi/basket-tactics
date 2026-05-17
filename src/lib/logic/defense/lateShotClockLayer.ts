// F.5 V1 — Late shot clock defense (modulation globale).
//
// Sous les 5 dernières secondes du shot clock, la défense SAIT que
// l'attaquant doit shooter : pas besoin de garder l'aide (no
// kick-out/dump-off possible). Donc on contest tout, pas d'aide,
// pas de fautes inutiles.
//
// V1 = modulation directe sur les positions calculées en amont :
//   - carrierDefender se rapproche du porteur (+ pression, contest visible)
//   - tous les autres défenseurs : helpFactor=0, helpTriggered=false,
//     helpAim=undefined → désactivation de l'aide visuelle pour ce step.
//
// Position dans le pipeline : couche 1.7 (après help sticky, avant pnr).
// Opt-in via `state.lateShotClockDefenseEnabled` + `step.shotClockRemaining`
// défini ET < 5. Si une condition manque → no-op.

import type { DefenderId, Matchups } from '../../types';
import { activeBallCarrier, activeOffense } from '../players';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Renforcement visuel du carrierDef vers le porteur (px). Modeste, juste
 *  pour qu'on voie la pression montée d'un cran sans casser la stance. */
const CONTEST_PRESSURE_PX = 10;

export function applyLateShotClockLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  void matchups;
  const { state, stepIdx, defenderIds } = ctx;

  if (!state.lateShotClockDefenseEnabled) return;
  const step = state.steps[stepIdx];
  if (!step) return;
  const shotClock = step.shotClockRemaining;
  if (typeof shotClock !== 'number' || shotClock >= 5) return;

  const carrier = activeBallCarrier(step, state.playerCount);
  const off = activeOffense(step.off, state.playerCount);

  defenderIds.forEach((dId) => {
    const target = positions[dId];
    if (target.matchedTo === carrier && carrier && off[carrier]) {
      // Pression accrue sur le porteur : déplace target légèrement vers lui.
      const ox = off[carrier].x;
      const oy = off[carrier].y;
      const dx = ox - target.x;
      const dy = oy - target.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.1) {
        const k = Math.min(CONTEST_PRESSURE_PX / len, 1);
        target.x += dx * k;
        target.y += dy * k;
      }
      // Le carrierDef reste en mode contest (helpTriggered NE change pas — il
      // ne fait pas help par construction).
    } else {
      // Tous les autres : désactive l'aide (no help, contest direct).
      target.helpFactor = 0;
      target.helpTriggered = false;
      target.helpAim = undefined;
      if (target.helpKind === 'active-help') {
        target.helpKind = undefined;
      }
    }
  });
}
