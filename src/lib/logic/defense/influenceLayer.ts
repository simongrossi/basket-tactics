// CVT Chantier 2b — Couche d'influence : interpose bias vers les lignes
// de passe.
//
// Pour chaque défenseur **non-porteur et non-écran**, applique un shift
// subtil (max `INTERPOSE_MAX_SHIFT_PX`) vers la projection orthogonale
// sur la ligne `porteur ↔ son homme`. Effet : les défenseurs occupent
// activement les lignes de passe au lieu de simplement marquer.
//
// Filtres conservateurs (skip) :
// - `isCarrierDefender` : marque le porteur, pas une ligne.
// - `denying` : déjà en strong-side deny, ne pas amplifier.
// - `onScreen` : action écran en cours, priorité au screen adjust.
// - `helpFactor ≥ 0.5` : aide active, sa cible est déjà sur la ligne.
// - `pnrRole` défini : rotation PnR en cours.
//
// Opt-in via `state.useSteeringEngine`. Cap dur à 5 px : reste sous
// le bruit visuel mais suffit à orienter le placement vers la ligne.

import type { DefenderId, Matchups, Point } from '../../types';
import { projectOnSegment } from '../influenceMap';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/**
 * Cap dur du shift produit par la couche d'influence (px). Calibré
 * pour rester sous le bruit visuel (~6 px) tout en orientant le
 * placement vers la ligne de passe.
 */
export const INTERPOSE_MAX_SHIFT_PX = 5;

export function applyInfluenceLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  const { off, ballCarrier, carrierPos, defenderIds } = ctx;
  if (!ballCarrier || !carrierPos) return;

  defenderIds.forEach((dId) => {
    const pos = positions[dId];
    if (!pos) return;
    if (pos.isCarrierDefender) return;
    if (pos.denying) return;
    if (pos.onScreen) return;
    if (pos.pnrRole) return;
    if (pos.helpFactor >= 0.5) return;

    const oId = matchups[dId];
    if (!oId) return;
    const attPos = off[oId];
    if (!attPos) return;

    // Projection de la position courante sur le segment porteur↔homme.
    const here: Point = { x: pos.x, y: pos.y };
    const proj = projectOnSegment(here, carrierPos, attPos);
    const dx = proj.x - pos.x;
    const dy = proj.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return;

    // Shift soft clampé à INTERPOSE_MAX_SHIFT_PX.
    const shift = Math.min(d, INTERPOSE_MAX_SHIFT_PX);
    pos.x += (dx / d) * shift;
    pos.y += (dy / d) * shift;
  });
}
