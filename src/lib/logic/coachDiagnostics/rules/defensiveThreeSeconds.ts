// Règle B7 — Defensive 3 seconds (règle FIBA).
//
// Un défenseur ne peut pas rester >3 secondes dans sa raquette défensive
// sans être à un bras d'un attaquant. Modélisation step-based : on compte
// les steps CONSÉCUTIFS où :
//   1. le défenseur est dans la raquette (`inPaint`)
//   2. aucun attaquant n'est à < `ARM_LENGTH_PX` du défenseur
//
// Si l'on observe 3 steps consécutifs qui violent les deux critères, on
// pose un diagnostic 'warning'. Pas de pénalité simulée (pas de score).

import type { AttackerId, AttackerPositions, Point } from '../../../types';
import { inPaint, distance } from '../../geometry';
import { effectiveDefensePositions } from '../../engine';
import { activeOffense } from '../../players';
import type { CoachDiagnostic, Rule } from '../types';

/** Distance "à un bras" pour considérer qu'un défenseur marque un
 *  attaquant (et donc qu'il ne stationne pas dans la raquette pour rien). */
const ARM_LENGTH_PX = 50;

function minDistToAttackers(p: Point, off: AttackerPositions): number {
  let min = Infinity;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const att = off[id];
    if (!att) return;
    const d = distance(p, att);
    if (d < min) min = d;
  });
  return min;
}

export const defensiveThreeSecondsRule: Rule = (ctx) => {
  const { state, stepIdx, defPos, defenderIds, hoop, off } = ctx;
  if (stepIdx < 2) return []; // besoin de 3 steps consécutifs

  const out: CoachDiagnostic[] = [];

  // Pré-calcul des positions/positions adverses pour N-1 et N-2 (une fois,
  // pas une par défenseur).
  const prevStep = state.steps[stepIdx - 1];
  const prevPrevStep = state.steps[stepIdx - 2];
  if (!prevStep || !prevPrevStep) return [];

  const prevDef = effectiveDefensePositions(state, stepIdx - 1);
  const prevOff = activeOffense(prevStep.off, state.playerCount);
  const prevPrevDef = effectiveDefensePositions(state, stepIdx - 2);
  const prevPrevOff = activeOffense(prevPrevStep.off, state.playerCount);

  for (const dId of defenderIds) {
    const dN = defPos[dId];
    const dN1 = prevDef[dId];
    const dN2 = prevPrevDef[dId];

    // Tous les 3 steps : dans la raquette ?
    if (!inPaint({ x: dN.x, y: dN.y }, hoop)) continue;
    if (!inPaint({ x: dN1.x, y: dN1.y }, hoop)) continue;
    if (!inPaint({ x: dN2.x, y: dN2.y }, hoop)) continue;

    // Tous les 3 steps : sans attaquant proche ?
    if (minDistToAttackers({ x: dN.x, y: dN.y }, off) <= ARM_LENGTH_PX) continue;
    if (minDistToAttackers({ x: dN1.x, y: dN1.y }, prevOff) <= ARM_LENGTH_PX) continue;
    if (minDistToAttackers({ x: dN2.x, y: dN2.y }, prevPrevOff) <= ARM_LENGTH_PX) continue;

    out.push({
      id: `def-3sec-${dId}-${stepIdx}`,
      severity: 'warning',
      message: `${dId} stationne dans la raquette depuis 3 étapes sans marquer (>1m d'écart) — violation 3 sec défensive`,
      tag: 'defensive-3sec',
      defenders: [dId],
      attackers: [],
    });
  }

  return out;
};
