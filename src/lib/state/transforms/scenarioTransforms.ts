// Transformations sur le scénario scripté : actions + branches.
// Toutes branch-aware via `mutateActionsScope`.

import type { AppState, ContinuityLoop, ScenarioBranch, ScriptedAction } from '@/lib/types';
import { mutateActionsScope, recompileScenarioSteps } from './shared';
import { rollCoverage, type CoverageWeight } from '@/lib/logic/reads/coverageRoll';

export function addScriptedAction(s: AppState, action: ScriptedAction): AppState {
  const next = mutateActionsScope(s, (list) => [...list, action]);
  return recompileScenarioSteps(next);
}

export function updateScriptedAction(
  s: AppState,
  id: string,
  action: ScriptedAction
): AppState {
  const next = mutateActionsScope(s, (list) => list.map((a) => (a.id === id ? action : a)));
  return recompileScenarioSteps(next);
}

export function deleteScriptedAction(s: AppState, id: string): AppState {
  const next = mutateActionsScope(s, (list) => list.filter((a) => a.id !== id));
  const cleanSteps = next.steps.map((st) =>
    st.generatedBy === id ? { ...st, manualOverride: false } : st
  );
  return recompileScenarioSteps({ ...next, steps: cleanSteps });
}

export function moveScriptedAction(s: AppState, id: string, dir: 'up' | 'down'): AppState {
  const next = mutateActionsScope(s, (list) => {
    const arr = [...list];
    const idx = arr.findIndex((a) => a.id === id);
    if (idx < 0) return arr;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= arr.length) return arr;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    return arr;
  });
  return recompileScenarioSteps(next);
}

/** N'efface PAS les steps existants : le user passe en mode 100% manuel,
 *  ses steps compilés restent intacts. */
export function clearScriptedActions(s: AppState): AppState {
  return { ...s, scriptedActions: [] };
}

// ----- Branches scénario -----

export function addScenarioBranch(s: AppState, branch: ScenarioBranch): AppState {
  const next = { ...s, scenarioBranches: [...(s.scenarioBranches ?? []), branch] };
  // Une branche RÉACTIVE (avec trigger) peut s'auto-activer selon la couverture
  // défensive → recompiler pour résoudre la lecture. Une branche manuelle ne
  // s'active qu'à la sélection → pas de recompile ici (comportement V1).
  return branch.trigger ? recompileScenarioSteps(next) : next;
}

/** Ajout groupé (ex : insertion des lectures canoniques d'un écran). Recompile
 *  une seule fois si au moins une branche est réactive. */
export function addScenarioBranches(s: AppState, branches: ScenarioBranch[]): AppState {
  if (branches.length === 0) return s;
  const next = { ...s, scenarioBranches: [...(s.scenarioBranches ?? []), ...branches] };
  return branches.some((b) => b.trigger) ? recompileScenarioSteps(next) : next;
}

export function updateScenarioBranch(
  s: AppState,
  id: string,
  branch: ScenarioBranch
): AppState {
  const list = (s.scenarioBranches ?? []).map((b) => (b.id === id ? branch : b));
  const next = { ...s, scenarioBranches: list };
  return s.activeBranchId === id ? recompileScenarioSteps(next) : next;
}

export function deleteScenarioBranch(s: AppState, id: string): AppState {
  // Cascade-suppression : supprimer la branche + toutes ses sous-branches (récursivement).
  const allDescendants = collectDescendantIds(s.scenarioBranches ?? [], id);
  const idsToRemove = new Set([id, ...allDescendants]);
  const list = (s.scenarioBranches ?? []).filter((b) => !idsToRemove.has(b.id));
  // Si l'active branch supprimée → remonter au parent (ou null)
  let activeBranchId = s.activeBranchId;
  if (activeBranchId && idsToRemove.has(activeBranchId)) {
    const deleted = (s.scenarioBranches ?? []).find((b) => b.id === id);
    activeBranchId = deleted?.parentBranchId ?? null;
  }
  return recompileScenarioSteps({ ...s, scenarioBranches: list, activeBranchId });
}

/** Collecte récursivement tous les ids de sous-branches d'une branche. */
function collectDescendantIds(branches: import('@/lib/types').ScenarioBranch[], parentId: string): string[] {
  const directChildren = branches.filter((b) => b.parentBranchId === parentId);
  return directChildren.flatMap((c) => [c.id, ...collectDescendantIds(branches, c.id)]);
}

export function setActiveBranch(s: AppState, id: string | null): AppState {
  return recompileScenarioSteps({ ...s, activeBranchId: id });
}

// Phase L proba — lecture probabiliste : la défense joue une distribution de
// couvertures tirée de façon seedée. Voir docs/superpowers/specs/
// 2026-06-02-lecture-probabiliste-design.md.

export function toggleProbabilisticReads(s: AppState, enabled: boolean): AppState {
  return recompileScenarioSteps({ ...s, probabilisticReadsEnabled: enabled });
}

export function setCoverageDistribution(s: AppState, dist: CoverageWeight[]): AppState {
  const seed = s.coverageRollSeed ?? 0;
  const rolled = rollCoverage(dist, seed) ?? undefined;
  return recompileScenarioSteps({
    ...s,
    coverageDistribution: dist,
    rolledCoverage: rolled,
  });
}

export function rerollCoverage(s: AppState): AppState {
  const seed = (s.coverageRollSeed ?? 0) + 1;
  const rolled = rollCoverage(s.coverageDistribution ?? [], seed) ?? undefined;
  return recompileScenarioSteps({
    ...s,
    coverageRollSeed: seed,
    rolledCoverage: rolled,
  });
}

// Phase Motion — continuity offense : pose/efface la boucle de continuité.
export function setContinuityLoop(s: AppState, loop: ContinuityLoop | null): AppState {
  const next = { ...s };
  if (loop) next.continuityLoop = loop;
  else delete next.continuityLoop;
  return recompileScenarioSteps(next);
}

// Phase Motion — auto-replacement : active/désactive + profondeur de cascade.
export function setAutoReplacement(s: AppState, enabled: boolean, depth: number): AppState {
  return recompileScenarioSteps({
    ...s,
    autoReplacementEnabled: enabled,
    autoReplacementDepth: Math.max(1, Math.min(4, Math.floor(depth))),
  });
}
