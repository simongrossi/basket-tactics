// Sélection de branche réactive (read-based offense, Phase L.0).
//
// Décide quelle `ScenarioBranch` jouer en fonction de la couverture défensive
// lue, SANS recompiler le scénario. Principe clé : une branche diverge APRÈS
// son action-écran ; la couverture se lit donc sur le dernier step de cette
// action, qui est AVANT tout point de divergence. Ce step est identique quel
// que soit la branche déjà active → on peut résoudre directement sur
// `state.steps` (déjà compilé), sans recompilation.
//
// Priorité : un choix MANUEL (`activeBranchId`) prime toujours sur la
// résolution automatique. Les branches sans `trigger` (V1) sont ignorées ici.

import type { AppState, ScenarioBranch, Step } from '../../types';
import { resolveScreenCoverage } from './resolveCoverage';

/** Index du dernier step généré par `actionId` (= moment d'usage de l'écran),
 *  ou -1 si l'action n'a produit aucun step dans la liste courante. */
function lastStepIndexGeneratedBy(steps: Step[], actionId: string): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].generatedBy === actionId) return i;
  }
  return -1;
}

/**
 * Retourne la branche à jouer.
 * - Override manuel (`activeBranchId`) → cette branche (ou `null` si introuvable).
 * - Sinon : première branche réactive dont le `trigger.coverage` matche la
 *   couverture lue au step d'usage de son écran.
 * - Sinon : `null` (chemin principal).
 */
export function selectReactiveBranch(state: AppState): { branch: ScenarioBranch | null } {
  const branches = state.scenarioBranches ?? [];

  // Le manuel prime toujours.
  if (state.activeBranchId) {
    return { branch: branches.find((b) => b.id === state.activeBranchId) ?? null };
  }

  for (const b of branches) {
    if (!b.trigger) continue;
    const readStepIdx = lastStepIndexGeneratedBy(state.steps, b.trigger.actionId);
    if (readStepIdx < 0) continue;
    const coverage = resolveScreenCoverage(state, readStepIdx);
    if (coverage && b.trigger.coverage.includes(coverage)) {
      return { branch: b };
    }
  }

  return { branch: null };
}
