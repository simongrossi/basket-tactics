// C.2 — Help-and-recover timing : couche 1.6 du pipeline défensif.
//
// Quand `state.helpStickiness` est défini (1..3) ET qu'un défenseur a été
// en aide active aux steps précédents MAIS plus au step courant, on
// MAINTIENT (avec decay) sa position d'aide précédente au lieu de le
// laisser snap-back sur son homme.
//
// Effet basket : un défenseur qui aide ne revient pas instantanément ; il
// glisse progressivement (1-3 steps = 2-6s à 2s/step) vers son matchup.
// Réalisme tactique typique des couvertures NBA/FIBA.
//
// Position dans le pipeline (cf. `engine.ts::computeDefenseTargets`) :
//   1   baseTargets           ← cible homme-à-homme + help bias instantané
//   1.5 rimProtection
//   1.6 helpSticky            ← ICI : maintient la cible d'aide précédente
//   2   pnrRotations          ← écrase si tag/x-out actifs (priorité PnR)
//   3   offBallScreens
//   4   trap
//   4.5 postCoverage
//   5   directives
//   5.5 cutterBump
//   6   postPassOrientation
//
// La position résultante passe ENCORE par `resolvePlayerCollisions` en aval
// (dans `effectiveDefensePositions`), donc la règle absolue d'anti-superposition
// reste garantie même si `prevHelpAim` placerait le défenseur sur un attaquant.

import type { DefenderId, Matchups, Point } from '../../types';
import { computeDefenseTargets } from '../engine';
import { consecutiveHelpSteps, cumulatedHelpMs } from './helpStepCounter';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyHelpStickyLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { state, stepIdx, defenderIds } = ctx;

  // V2 (ms) prime sur V1 (steps). Si aucun défini → legacy strict.
  const stickinessMs = state.helpStickinessMs;
  const stickiness = state.helpStickiness;
  const useV2 = typeof stickinessMs === 'number' && stickinessMs > 0;
  const useV1 = !useV2 && typeof stickiness === 'number' && stickiness > 0;
  if (!useV2 && !useV1) return;
  if (stepIdx === 0) return;

  // Récupère les positions du step précédent UNE seule fois (coûteux).
  // `computeDefenseTargets` est récursif sur stepIdx-1 → stepIdx-2 → ...
  // mais à chaque appel l'index décroît, et au step 0 on bail out. Pas de
  // cycle (idem applyPnRRotationsLayer qui appelle aussi un computeTargets
  // précédent indirectement).
  let prevTargets: ReturnType<typeof computeDefenseTargets>['positions'] | null = null;

  defenderIds.forEach((dId) => {
    const target = positions[dId];

    // Skip si déjà en aide active au step courant : le base layer a déjà fait
    // le job, pas besoin de sticky.
    if (target.helpTriggered) return;

    // Skip si défenseur en contact d'écran → priorité au screen freeze.
    if (target.onScreen) return;

    // Skip si défenseur en rotation PnR → priorité aux rotations.
    if (target.pnrRole) return;

    // Skip si défenseur impliqué dans un scram switch ou switchedThisStep.
    if (target.switchedThisStep || target.scrammedThisStep) return;

    // Calcule le blend factor selon V1 (steps) ou V2 (ms).
    let blendFactor: number;
    if (useV2) {
      const cumMs = cumulatedHelpMs(state, stepIdx, dId);
      if (cumMs === 0) return;                   // jamais en aide récemment
      if (cumMs >= stickinessMs!) return;        // au-delà du seuil → recover complet
      blendFactor = Math.max(0, 1 - cumMs / stickinessMs!);
    } else {
      const consec = consecutiveHelpSteps(state, stepIdx, dId);
      if (consec === 0) return;
      if (consec >= stickiness!) return;
      blendFactor = Math.max(0, 1 - consec / stickiness!);
    }

    // Lazy load des positions précédentes.
    if (!prevTargets) {
      prevTargets = computeDefenseTargets(state, stepIdx - 1).positions;
    }
    const prevTarget = prevTargets[dId];
    const prevHelpAim = prevTarget.helpAim;

    // Si le step précédent n'avait pas de helpAim (improbable mais possible),
    // on prend la position précédente du défenseur lui-même.
    const stickyPoint: Point = prevHelpAim ?? { x: prevTarget.x, y: prevTarget.y };

    // Decay déjà calculé au-dessus (V1 ou V2). À blendFactor=0 on bail out,
    // à blendFactor proche de 1 on garde majoritairement la cible d'aide.
    positions[dId].x = stickyPoint.x * blendFactor + target.x * (1 - blendFactor);
    positions[dId].y = stickyPoint.y * blendFactor + target.y * (1 - blendFactor);

    // Marque le défenseur comme toujours en aide (decay visuel + diagnostics).
    positions[dId].helpTriggered = true;
    positions[dId].helpKind = 'active-help';
    positions[dId].helpAim = stickyPoint;
    // Pondère helpFactor pour que les rendus de lignes d'aide reflètent l'état.
    positions[dId].helpFactor = Math.max(target.helpFactor, blendFactor * 0.7);
  });
  // matchups passé par référence mais non muté ici : la couche sticky ne
  // change pas les matchups (juste les positions visuelles).
  void matchups;
}
