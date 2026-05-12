// Transformations sur le scénario scripté : actions + branches.
// Toutes branch-aware via `mutateActionsScope`.

import type { AppState, ScenarioBranch, ScriptedAction } from '@/lib/types';
import { mutateActionsScope, recompileScenarioSteps } from './shared';

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
  return { ...s, scenarioBranches: [...(s.scenarioBranches ?? []), branch] };
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
  const list = (s.scenarioBranches ?? []).filter((b) => b.id !== id);
  const activeBranchId = s.activeBranchId === id ? null : s.activeBranchId;
  return recompileScenarioSteps({ ...s, scenarioBranches: list, activeBranchId });
}

export function setActiveBranch(s: AppState, id: string | null): AppState {
  return recompileScenarioSteps({ ...s, activeBranchId: id });
}
