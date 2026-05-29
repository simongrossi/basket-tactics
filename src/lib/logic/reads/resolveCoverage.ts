// Résolution de la couverture défensive jouée (read-based offense, Phase L.0).
//
// Lit la couverture EFFECTIVE d'un écran porteur à un step donné, telle que le
// moteur défensif la joue réellement. On ne recalcule rien : on réutilise
// `buildDefenseFrameContext`, qui est la source unique de vérité pour la
// détection d'écran ET la résolution de la règle effective (override par
// défenseur > règle globale, + ajustements hedge-recovery / unwind-reject).
// Cette réutilisation garantit la PARITÉ avec ce qu'affiche le pipeline — pas
// de divergence possible entre la lecture offensive et la couverture rendue.

import type { AppState, ScreenRule } from '../../types';
import { buildDefenseFrameContext } from '../defense/context';

/**
 * Couverture effective sur l'écran porteur au step `atStepIdx`.
 *
 * @returns le `ScreenRule` réellement joué (over/under/switch/hedge/drop/blitz/
 *   ice/weak/peel-switch), ou `null` si aucun écran porteur n'est détecté à ce
 *   step (l'offense joue alors le chemin principal).
 */
export function resolveScreenCoverage(
  state: AppState,
  atStepIdx: number
): ScreenRule | null {
  if (atStepIdx < 0 || atStepIdx >= state.steps.length) return null;
  // La défense réactive (zone / junk / press) n'expose pas de couverture
  // d'écran porteur lisible : la lecture réactive V1 cible le man-to-man.
  if (state.defenseSystem !== 'man') return null;
  const { ctx } = buildDefenseFrameContext(state, atStepIdx);
  return ctx.screen ? ctx.effectiveScreenRule : null;
}
