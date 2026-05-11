// À step 0 en édition libre (un seul step, le coach place les joueurs),
// les défenseurs n'ont pas encore "rejoint le jeu" : leur position vient de
// defenseInitial qui peut être loin du jeu courant. `detectScreen` cherche
// les poseurs à <screenRadius (35px) du défenseur du porteur — sans
// substitution, AUCUN écran n'est jamais détecté au step 0.
//
// Ce helper substitue, pour chaque défenseur, sa position par sa cible
// homme-à-homme idéale (collée à son homme). Utilisé uniquement pour la
// DÉTECTION ; le "from" pour le calcul de path reste defenseInitial.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Matchups,
} from '../types';
import { getDefenseHoop } from './engine';
import { carrierDefenderTarget, manTarget } from './manDefense';

export function buildStep0DetectionPositions(
  state: AppState,
  off: AttackerPositions,
  ballCarrier: AttackerId,
  matchups: Matchups,
  fallback: DefenderPositions
): DefenderPositions {
  const out: DefenderPositions = { ...fallback };
  const hoop = getDefenseHoop(state);
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([dId, oId]) => {
    const att = off[oId];
    if (!att) return;
    const rule = state.rules[dId];
    const dist = rule?.distance ?? state.defenseDistance;
    const target = oId === ballCarrier
      ? carrierDefenderTarget(rule?.vsCarrier ?? 'coller', att, dist, hoop) ?? manTarget(att, dist, hoop)
      : manTarget(att, dist, hoop);
    if (target) out[dId] = target;
  });
  return out;
}
