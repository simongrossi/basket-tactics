// Helpers internes partagés par plusieurs modules de transforms.
//
//  - `markStepAsManual` : marque un step compilé comme édité manuellement, pour
//    qu'une recompile ultérieure du scénario ne l'écrase pas.
//  - `recompileScenarioSteps` : régénère `state.steps` à partir des actions
//    scriptées de la branche active (ou main). Conserve le step 0 et préserve
//    `manualOverride`.
//  - `mutateActionsScope` : applique une mutation sur la liste d'actions de la
//    branche active si elle existe, sinon sur `mainActions`. Évite de
//    dupliquer cette logique dans chaque transform branch-aware.

import type { AppState, ScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';

export function markStepAsManual(state: AppState, stepIdx: number): AppState {
  if (stepIdx <= 0) return state;
  const cur = state.steps[stepIdx];
  if (!cur || !cur.generatedBy || cur.manualOverride) return state;
  const steps = [...state.steps];
  steps[stepIdx] = { ...cur, manualOverride: true };
  return { ...state, steps };
}

export function recompileScenarioSteps(state: AppState): AppState {
  const actions = state.scriptedActions;
  if (!actions || actions.length === 0) return state;
  const initial = state.steps[0];
  if (!initial) return state;
  const activeBranch = state.activeBranchId
    ? state.scenarioBranches?.find((b) => b.id === state.activeBranchId) ?? null
    : null;
  const newSteps = compileScenario({
    initialOff: initial.off,
    initialBallCarrier: initial.ballCarrier,
    actions,
    existingSteps: state.steps,
    playerCount: state.playerCount,
    activeBranch,
  });
  const activeStep = Math.min(state.activeStep, newSteps.length - 1);
  return { ...state, steps: newSteps, activeStep };
}

export function mutateActionsScope(
  s: AppState,
  mutate: (list: ScriptedAction[]) => ScriptedAction[]
): AppState {
  if (s.activeBranchId) {
    const branches = (s.scenarioBranches ?? []).map((b) =>
      b.id === s.activeBranchId ? { ...b, actions: mutate(b.actions) } : b
    );
    return { ...s, scenarioBranches: branches };
  }
  return { ...s, scriptedActions: mutate(s.scriptedActions ?? []) };
}
