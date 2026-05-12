// Actions défensives scriptées (Phase 3 — Task 6).
// L'ajout fabrique un id ; les mutations recompile le scénario.

import type {
  AppState,
  DefensiveActionParams,
  DefensiveActionType,
  DefensiveScriptedAction,
} from '@/lib/types';
import { newScriptedActionId } from '@/lib/logic/compileScenario';
import { recompileScenarioSteps } from './shared';

export function addDefensiveAction(
  s: AppState,
  type: DefensiveActionType,
  params: DefensiveActionParams,
  parentActionId?: string,
  affectedSteps?: number[]
): AppState {
  const newAction: DefensiveScriptedAction = {
    kind: 'defensive',
    id: newScriptedActionId(),
    type,
    parentActionId,
    affectedSteps,
    params,
  };
  const next: AppState = {
    ...s,
    scriptedActions: [...(s.scriptedActions ?? []), newAction],
  };
  return recompileScenarioSteps(next);
}

export function updateDefensiveAction(
  s: AppState,
  id: string,
  updated: DefensiveScriptedAction
): AppState {
  const list = (s.scriptedActions ?? []).map((a) => (a.id === id ? updated : a));
  return recompileScenarioSteps({ ...s, scriptedActions: list });
}

export function deleteDefensiveAction(s: AppState, id: string): AppState {
  const list = (s.scriptedActions ?? []).filter((a) => a.id !== id);
  return recompileScenarioSteps({ ...s, scriptedActions: list });
}

export function toggleScriptedDefense(s: AppState): AppState {
  return {
    ...s,
    defenseScriptedDirectivesEnabled:
      s.defenseScriptedDirectivesEnabled === false ? true : false,
  };
}
