// Détection d'événements tactiques sur une étape : pour l'instant, écran
// porteur + classification de l'action (roll/pop/slip/short-roll/ghost/
// reject/snake/re-screen). Glue qui rassemble matchups, positions précédentes,
// écran précédent (pour `re-screen`) et positions de N-2 (pour `snake`).
//
// Vit dans `events/` plutôt que dans `defense/` parce que c'est de la
// LECTURE d'état, pas du calcul de cible défensive — consommé en lecture
// seule par coachDiagnostics, tacticalReads et l'app shell.

import type { AppState, DetectedScreen } from '../../types';
import { activeBallCarrier, activeDefenseInitial, activeOffense } from '../players';
import { detectScreen } from '../screens';
import { detectScreenAction, type DetectedScreenAction } from '../screenAction';
import { computeDefenseTargets, extractDefenderPositions, getDefenseHoop, getMatchupsAt } from '../engine';

/**
 * Détecte l'écran porteur ET le type d'action pour une étape donnée. Retourne
 * `null` si aucun écran n'est détecté ou si la défense n'est pas en mode man.
 */
export function detectStepScreenAction(
  state: AppState,
  stepIdx: number
): { screen: DetectedScreen; action: DetectedScreenAction } | null {
  if (state.defenseSystem !== 'man') return null;
  const cur = state.steps[stepIdx];
  if (!cur) return null;
  const off = activeOffense(cur.off, state.playerCount);
  const ballCarrier = activeBallCarrier(cur, state.playerCount);
  const matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
  const prevDef =
    stepIdx === 0
      ? activeDefenseInitial(state.defenseInitial, state.playerCount)
      : extractDefenderPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
  const prevOff = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : null;
  const prevPrevOff = stepIdx > 1 ? activeOffense(state.steps[stepIdx - 2].off, state.playerCount) : null;
  const screen = detectScreen(
    off, ballCarrier, matchups, prevDef, state.screenRadius, cur.forcedScreener, prevOff ?? undefined
  );
  if (!screen) return null;
  let prevScreen: DetectedScreen | null = null;
  if (stepIdx > 0) {
    const prevStep = state.steps[stepIdx - 1];
    const prevStepOff = activeOffense(prevStep.off, state.playerCount);
    const prevCarrier = activeBallCarrier(prevStep, state.playerCount);
    const prevMatchups = getMatchupsAt(state.steps, stepIdx - 2, state.playerCount);
    const prevPrevDef =
      stepIdx === 1
        ? activeDefenseInitial(state.defenseInitial, state.playerCount)
        : extractDefenderPositions(computeDefenseTargets(state, stepIdx - 2, false).positions);
    prevScreen = detectScreen(
      prevStepOff, prevCarrier, prevMatchups, prevPrevDef, state.screenRadius, prevStep.forcedScreener,
      prevPrevOff ?? undefined
    );
  }
  const action = detectScreenAction(
    off, prevOff, screen, prevScreen, prevPrevOff, getDefenseHoop(state)
  );
  return { screen, action };
}
