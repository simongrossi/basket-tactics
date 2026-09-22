// B.3 V1 — End-of-quarter "contest mode" awareness.
//
// Concept basket : sous les 5 dernières secondes du chrono de quart,
// si l'équipe défensive est DÉJÀ en bonus (≥ 4 fautes), la stratégie
// inverse F.4 : on n'a plus l'option du foul to give (donne LF), donc
// il faut **contester sans fauter** ("all-hands-up, no fouls").
//
// V1 = détection + diagnostic + badge. Pas de modification de positions
// (la couche moteur reste neutre pour V1, on signale juste au coach
// l'attitude attendue).
//
// Conditions cumulées :
//   1. `step.clockSeconds < 5`            (fin de quart)
//   2. `state.defenseTeamFouls >= 4`      (équipe en bonus — fauter coûte 2 LF)
//
// Différence avec F.4 (foul to give) : F.4 s'active quand l'équipe N'EST PAS
// encore en bonus (< 4 fautes). Les deux sont donc exclusifs sur l'axe
// `defenseTeamFouls`, ils ne peuvent jamais déclencher en même temps.

import type { AppState, DefenderId } from '../../types';
import { computeDefenseTargets } from '../engine';
import { activeBallCarrier } from '../players';

export interface EndOfClockContestSignal {
  /** Défenseur du porteur — cible du contest. */
  carrierDefender: DefenderId;
  /** Secondes restantes au quart (< 5). */
  clockSeconds: number;
  /** Fautes équipe défense (≥ 4, donc bonus). */
  teamFouls: number;
}

export function detectEndOfClockContest(
  state: AppState,
  stepIdx: number
): EndOfClockContestSignal | null {
  const step = state.steps[stepIdx];
  if (!step) return null;

  // Condition 1 — fin de quart imminente.
  const clockSeconds = step.clockSeconds;
  if (typeof clockSeconds !== 'number' || clockSeconds >= 5 || clockSeconds < 0) return null;

  // Condition 2 — équipe en bonus (pas d'option foul to give).
  const teamFouls = state.defenseTeamFouls ?? 0;
  if (teamFouls < 4) return null;

  const carrier = activeBallCarrier(step, state.playerCount);
  if (!carrier) return null;

  // Trouve le défenseur du porteur via matchups.
  const defTargets = computeDefenseTargets(state, stepIdx).positions;
  let carrierDefender: DefenderId | null = null;
  for (const dId of Object.keys(defTargets) as DefenderId[]) {
    if (defTargets[dId].matchedTo === carrier) {
      carrierDefender = dId;
      break;
    }
  }
  if (!carrierDefender) return null;

  return { carrierDefender, clockSeconds, teamFouls };
}
