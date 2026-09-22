// F.4 V1 — End-of-quarter "foul to give" detection.
//
// Concept basket : sous les 5 dernières secondes du chrono de quart,
// si l'équipe défensive n'est pas encore en bonus (< 4 fautes équipe),
// elle PEUT volontairement faire faute pour stopper l'horloge et éviter
// un tir au buzzer. Stratégie ultra-courante NBA/EuroLeague.
//
// V1 = détection + diagnostic + badge. Pas de modification de positions.
// Conditions cumulées :
//  1. `step.clockSeconds < 5` (fin de quart imminente)
//  2. `state.defenseTeamFouls < 4` (pas encore en bonus)
//  3. Porteur en mouvement vers le panier (drive trigger OU
//     delta-distance vers hoop > 30 px depuis step précédent)

import type { AppState, AttackerId, DefenderId, Point } from '../../types';
import { getDefenseHoop, computeDefenseTargets } from '../engine';
import { activeBallCarrier, activeOffense } from '../players';
import { detectTriggers } from '../triggers';

export interface FoulToGiveOpportunity {
  /** Défenseur qui matched le porteur (cible logique de la faute). */
  carrierDefender: DefenderId;
  /** Porteur de balle. */
  carrier: AttackerId;
  /** Secondes restantes au quart (< 5). */
  clockSeconds: number;
  /** Fautes équipe défense en cours (< 4). */
  teamFouls: number;
}

export function detectFoulToGiveOpportunity(
  state: AppState,
  stepIdx: number
): FoulToGiveOpportunity | null {
  const step = state.steps[stepIdx];
  if (!step) return null;

  // Condition 1 — fin de quart imminente.
  const clockSeconds = step.clockSeconds;
  if (typeof clockSeconds !== 'number' || clockSeconds >= 5 || clockSeconds < 0) return null;

  // Condition 2 — pas encore en bonus.
  const teamFouls = state.defenseTeamFouls ?? 0;
  if (teamFouls >= 4) return null;

  // Condition 3 — porteur en mouvement vers le panier.
  const carrier = activeBallCarrier(step, state.playerCount);
  if (!carrier) return null;
  const off = activeOffense(step.off, state.playerCount);
  const carrierPos = off[carrier];
  if (!carrierPos) return null;
  const hoop = getDefenseHoop(state);
  if (!isDrivingToHoop(state, stepIdx, carrier, carrierPos, hoop)) return null;

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

  return { carrierDefender, carrier, clockSeconds, teamFouls };
}

/** Drive si trigger explicite OU si le porteur s'est rapproché du panier
 *  de plus de 30 px depuis le step précédent. */
function isDrivingToHoop(
  state: AppState,
  stepIdx: number,
  carrier: AttackerId,
  carrierPos: Point,
  hoop: Point
): boolean {
  // Trigger explicite.
  const step = state.steps[stepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const prevOff = stepIdx > 0
    ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount)
    : null;
  const triggers = detectTriggers(off, prevOff, carrier, state.triggers, hoop);
  if (triggers.drive) return true;

  // Fallback géométrique : delta de distance au panier > 30 px (mouvement net).
  if (!prevOff || !prevOff[carrier]) return false;
  const prevPos = prevOff[carrier];
  const dPrev = Math.hypot(prevPos.x - hoop.x, prevPos.y - hoop.y);
  const dCur = Math.hypot(carrierPos.x - hoop.x, carrierPos.y - hoop.y);
  return dPrev - dCur > 30;
}
