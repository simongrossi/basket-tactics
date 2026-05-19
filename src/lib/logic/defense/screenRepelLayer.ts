// CVT Chantier 1.3b — Couche repel autour des poseurs d'écran.
//
// **Conservatrice par design** : ne REMPLACE PAS le push-out binaire
// existant dans `screens/helpers.ts` et `applyScreenAdjustment`. Vient
// l'AFFINER en aval pour les défenseurs qui se trouvent proches d'un
// poseur SANS être directement impliqués dans l'action écran (carrier
// defender en hedge/blitz et screener's defender restent traités par
// les couches spécialisées).
//
// Effet : un défenseur "périphérique" (rotation tag, X-out, help)
// qui traverse l'orbite du poseur reçoit un shift fluide via `repel`
// (rampe linéaire) au lieu de claquer sur le cercle de clearance.
//
// Cap dur 3 px (encore plus serré que `INTERPOSE_MAX_SHIFT_PX=5`)
// pour limiter le risque sur les tests `screens*` / `overlap*`.
// Opt-in via `state.useSteeringEngine`.

import type { DefenderId, Matchups } from '../../types';
import { screenerRepelForce } from '../screens/repelForces';
import { accumulateForces } from '../steeringEngine';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Cap dur du shift produit par cette couche (px). Très conservateur. */
export const SCREEN_REPEL_LAYER_MAX_SHIFT_PX = 3;

export function applyScreenRepelLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  const { state, off, defenderIds, screen } = ctx;
  if (!state.useSteeringEngine) return;
  if (!screen) return; // pas d'écran détecté → rien à affiner

  const screenerPos = off[screen.screener];
  if (!screenerPos) return;

  defenderIds.forEach((dId) => {
    const pos = positions[dId];
    if (!pos) return;
    // Skip les défenseurs directement impliqués dans l'action écran :
    // ils sont gérés par applyScreenAdjustment + push-out binaire.
    if (dId === screen.carrierDef) return;
    if (dId === screen.screenerDef) return;
    // Skip également les défenseurs en rôle PnR (tag/x-out/stunt) :
    // applyPnRRotationsLayer a déjà fait son job.
    if (pos.pnrRole) return;

    // Force repel autour du poseur depuis la position courante.
    // Si le défenseur est hors du rayon `SCREEN_REPEL_RADIUS_PX = 46`,
    // la force est morte → no-op.
    const f = screenerRepelForce({ x: pos.x, y: pos.y }, screenerPos);
    if (f.weight <= 0) return;

    const accum = accumulateForces([f]);
    const mag = Math.hypot(accum.x, accum.y);
    if (mag < 1e-3) return;

    // Cap dur du shift à SCREEN_REPEL_LAYER_MAX_SHIFT_PX.
    const shift = Math.min(mag, SCREEN_REPEL_LAYER_MAX_SHIFT_PX);
    pos.x += (accum.x / mag) * shift;
    pos.y += (accum.y / mag) * shift;
  });
}
