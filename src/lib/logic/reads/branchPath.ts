// Lectures multi-niveaux — résolution du chemin de branches.
//
// Une sous-branche porte `parentBranchId` pointant vers sa branche parente.
// Cette chaîne forme un arbre implicite dans la liste plate `scenarioBranches`.
// `resolveActiveBranchPath` remonte la chaîne pour obtenir le chemin ordonné
// [racine → ... → feuille], utilisé par `compileScenario` pour construire la
// suite d'actions effective.

import type { ScenarioBranch, ScriptedAction } from '../../types';

/**
 * Remonte la chaîne parentale depuis `leafId` et retourne le chemin ordonné
 * [branche_racine, ..., branche_feuille]. Protégé contre les cycles (max 20).
 * Retourne [] si `leafId` est introuvable.
 */
export function resolveActiveBranchPath(
  branches: ScenarioBranch[],
  leafId: string,
): ScenarioBranch[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const path: ScenarioBranch[] = [];
  let current: ScenarioBranch | undefined = byId.get(leafId);
  let guard = 0;
  while (current && guard < 20) {
    path.unshift(current);
    current = current.parentBranchId ? byId.get(current.parentBranchId) : undefined;
    guard++;
  }
  return path;
}

/**
 * Construit la liste effective d'actions en appliquant le chemin de branches
 * en cascade sur le chemin principal.
 *
 * Pour chaque branche du chemin (de la racine vers la feuille) :
 *   - cherche `divergeAfterActionId` dans les actions courantes
 *   - remplace la suite par les actions de la branche
 *
 * Exemple : main=[PnR, shoot_main], path=[branch_drop, branch_lowman] →
 *   après branch_drop  : [PnR, pull-up]
 *   après branch_lowman: [PnR, pull-up, dump-off]
 */
export function buildEffectiveActions(
  mainActions: ScriptedAction[],
  branchPath: ScenarioBranch[],
): ScriptedAction[] {
  let actions: ScriptedAction[] = mainActions;
  for (const branch of branchPath) {
    const divergeIdx = actions.findIndex((a) => a.id === branch.divergeAfterActionId);
    if (divergeIdx >= 0) {
      actions = [...actions.slice(0, divergeIdx + 1), ...branch.actions];
    }
    // Si divergeAfterActionId introuvable → fallback : branche ignorée
  }
  return actions;
}

