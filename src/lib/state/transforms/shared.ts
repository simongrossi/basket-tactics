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
import { selectReactiveBranch } from '@/lib/logic/reads/selectReactiveBranch';

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
  // Phase L — sélection de branche : le choix manuel (`activeBranchId`) prime ;
  // sinon une branche RÉACTIVE est auto-sélectionnée selon la couverture
  // défensive lue. Lecture faite sur `state.steps` courant (le step d'usage de
  // l'écran précède toute divergence → stable). Rétrocompat : sans branche
  // réactive ni manuelle, `branch` est null → comportement chemin principal.
  const { branch: activeBranch } = selectReactiveBranch(state);
  const newSteps = compileScenario({
    initialOff: initial.off,
    initialBallCarrier: initial.ballCarrier,
    actions,
    existingSteps: state.steps,
    playerCount: state.playerCount,
    activeBranch,
  });
  const activeStep = Math.min(state.activeStep, newSteps.length - 1);
  // Badge « Lecture : … » : id de la branche RÉSOLUE automatiquement (= branche
  // réactive active sans override manuel). Null si manuel ou chemin principal.
  const resolvedReadBranchId =
    !state.activeBranchId && activeBranch?.trigger ? activeBranch.id : null;
  return { ...state, steps: newSteps, activeStep, resolvedReadBranchId };
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
