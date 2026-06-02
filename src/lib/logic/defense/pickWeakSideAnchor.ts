// #8.2 — Désignation de l'ancre weak-side.
//
// Retourne le défenseur qui protège la raquette/skip côté faible :
//  - priorité à l'override coach (rule.weakSideAnchor === true, weak-side vérifié)
//  - sinon auto = le défenseur weak-side le plus proche du panier ("low man").
// Exclut le carrierDef (le défenseur du porteur, jamais ancre). Pur.

import type { AttackerId, AttackerPositions, DefenderId, Matchups, Point } from '../../types';
import { ballSide, distance } from '../geometry';

export function pickWeakSideAnchor(
  off: AttackerPositions,
  carrier: AttackerId,
  matchups: Matchups,
  defenderIds: DefenderId[],
  hoop: Point,
  rules: Partial<Record<DefenderId, { weakSideAnchor?: boolean }>>,
): DefenderId | null {
  const carrierPos = off[carrier];
  if (!carrierPos) return null;
  const carrierSideSign = ballSide(carrierPos); // -1 G, 0 axe, +1 D

  // carrierDef = défenseur dont le matchup est le porteur.
  let carrierDef: DefenderId | null = null;
  for (const dId of defenderIds) {
    if (matchups[dId] === carrier) { carrierDef = dId; break; }
  }

  // Candidats weak-side (homme côté opposé au ballon), hors carrierDef.
  const candidates: { dId: DefenderId; distToHoop: number }[] = [];
  for (const dId of defenderIds) {
    if (dId === carrierDef) continue;
    const manId = matchups[dId];
    const manPos = off[manId];
    if (!manPos) continue;
    const manSide = ballSide(manPos);
    // weak-side = côté strictement opposé au ballon (et ballon pas sur l'axe).
    const isWeak = carrierSideSign !== 0 && manSide !== 0 && manSide !== carrierSideSign;
    if (!isWeak) continue;
    candidates.push({ dId, distToHoop: distance(manPos, hoop) });
  }

  if (candidates.length === 0) return null;

  // Override coach prioritaire (parmi les candidats weak-side).
  const manual = candidates.find((c) => rules[c.dId]?.weakSideAnchor === true);
  if (manual) return manual.dId;

  // Auto : le plus proche du panier (low man).
  candidates.sort((a, b) => a.distToHoop - b.distToHoop);
  return candidates[0].dId;
}
