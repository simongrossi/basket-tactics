// Couche 5 — Directives défensives scriptées (`step.defensiveDirectives`).
// Override additif : seuls les défenseurs nommés dans la directive sont
// touchés. S'applique APRÈS tous les calculs standard (man + écrans + PnR
// + trap auto) pour permettre la prise de précédence par scénario.

import type { DefenderId, DefenderPositions, Step } from '../../types';
import { applyDirective } from '../applyDirective';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyDirectiveLayer(
  positions: Record<DefenderId, DefenderTarget>,
  ctx: DefenseFrameContext
): void {
  const { state, step, off, ballCarrier, defenderIds } = ctx;
  if (!step.defensiveDirectives || state.defenseScriptedDirectivesEnabled === false) return;

  const directiveTargets = {} as DefenderPositions;
  defenderIds.forEach((dId) => {
    directiveTargets[dId] = { x: positions[dId].x, y: positions[dId].y };
  });
  const activeDefenders = new Set(defenderIds);
  const activeStep: Step = { ...step, off, ballCarrier };
  for (const directive of step.defensiveDirectives) {
    const activeDirective = {
      ...directive,
      defenders: directive.defenders.filter((dId) => activeDefenders.has(dId)),
      swapWith: directive.swapWith && activeDefenders.has(directive.swapWith)
        ? directive.swapWith
        : undefined,
    };
    if (activeDirective.defenders.length === 0) continue;
    applyDirective(directiveTargets, activeDirective, activeStep);
  }
  // Re-projette les nouvelles positions sur le record `positions` (arrondi).
  defenderIds.forEach((dId) => {
    positions[dId].x = Math.round(directiveTargets[dId].x);
    positions[dId].y = Math.round(directiveTargets[dId].y);
  });
}
