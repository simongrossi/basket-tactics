// Couche 4.5 — Couverture défensive auto sur post-up (B6).
//
// Quand le trigger `post` est actif (ball carrier en position low post tenu
// statique), un défenseur "low man" peut :
//
//  - DIG  : faire 30% du chemin vers le pivot (toucher la balle puis recover
//           — faux help, recover naturel à l'étape suivante).
//  - DOUBLE : rester à 50% du chemin (double team actif).
//
// Le digger est choisi comme le défenseur non-carrierDef le plus proche du
// pivot, à condition qu'il ne soit pas déjà occupé (helpFactor > 0.5, ou
// pnrRole assigné).
//
// V1 — opt-in via `state.postCoverage` (default 'none', rétrocompat).
// `state.triggers.post` doit aussi être activé pour que le post soit détecté.

import type { DefenderId, Matchups } from '../../types';
import { distance } from '../geometry';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import {
  POST_DIG_FRACTION as DIG_FRACTION,
  POST_DOUBLE_FRACTION as DOUBLE_FRACTION,
  POST_HELP_BUSY_THRESHOLD as HELP_BUSY_THRESHOLD,
} from './constants';

export function applyPostCoverageLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const coverage = ctx.state.postCoverage ?? 'none';
  if (coverage === 'none') return;
  if (!ctx.triggers.post) return; // trigger pas actif → pas de couverture

  const { ballCarrier, carrierPos, defenderIds } = ctx;

  // Identifier le défenseur du pivot (carrierDef) — il reste sur le pivot.
  let carrierDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, string][]).forEach(([d, a]) => {
    if (a === ballCarrier) carrierDef = d;
  });
  if (!carrierDef) return;

  // Trouver le digger : défenseur ≠ carrierDef le plus proche du pivot,
  // pas déjà engagé (helpFactor < seuil, pas de pnrRole).
  let digger: DefenderId | null = null;
  let bestDist = Infinity;
  for (const dId of defenderIds) {
    if (dId === carrierDef) continue;
    const target = positions[dId];
    if (!target) continue;
    if ((target.helpFactor ?? 0) > HELP_BUSY_THRESHOLD) continue;
    if (target.pnrRole) continue;
    const d = distance({ x: target.x, y: target.y }, carrierPos);
    if (d < bestDist) {
      bestDist = d;
      digger = dId;
    }
  }
  if (!digger) return;

  // Appliquer le mouvement du digger vers le pivot.
  const fraction = coverage === 'double' ? DOUBLE_FRACTION : DIG_FRACTION;
  const target = positions[digger];
  target.x = Math.round(target.x + (carrierPos.x - target.x) * fraction);
  target.y = Math.round(target.y + (carrierPos.y - target.y) * fraction);

  // Marquer le digger comme aidant (visu : ring help cyan/violet déjà géré
  // par helpFactor en aval). On l'élève à 0.6 pour traverser le seuil de
  // rendu et trigger l'anneau d'aide.
  target.helpFactor = Math.max(target.helpFactor ?? 0, coverage === 'double' ? 0.9 : 0.6);
  target.helpTriggered = true;
  // Tag debug : on réutilise pnrRole 'stunt' (faux help) pour le dig, et
  // pas de tag spécial pour le double (le ring help fort fera l'affaire).
  if (coverage === 'dig') {
    target.pnrRole = 'stunt';
  }
}
