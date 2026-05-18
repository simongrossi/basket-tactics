// F.2 V1 — Press defense (half-court 2-2-1).
//
// Couvre la pression demi-terrain : la défense se positionne haut sur
// le terrain offensif (côté de la moitié où l'attaque arrive) pour
// harceler la montée de balle et la remise en jeu.
//
// V1 = statique : positions fixes selon attackingDirection. Pas de
// trap dynamique au franchissement de la médiane (V2). Pas de
// full-court (V2). Pas de retreat (V2).
//
// Pattern identique à F.1 junk : court-circuit du pipeline man comme
// la zone. Aucune modification de getDefenseHoop, screens/, defense/*.
// → Zéro risque Règle 1bis CLAUDE.md.

import type { AppState, DefenderId, Matchups, Point } from '../../types';
import { baseMatchups } from '../../data/initial';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';
import { computeDefenderOrientation } from '../orientation';
import type { DefenderTarget } from './types';

/** Formation 2-2-1 half-court (5 défenseurs) :
 *  - 2 sur la ligne médiane (= entrée du terrain offensif)
 *  - 2 sur la zone de relais (= 1/3 supérieur, vers le panier offense)
 *  - 1 protecteur arrière au centre (= sweeper sous le panier defense)
 *
 *  Coordonnées exprimées en deltas depuis le panier DÉFENSE (hoop).
 *  `dy < 0` signifie "vers le panier offense" (= vers le HAUT du
 *  terrain si attackingDirection='up').
 *
 *  Le sign dy est inversé selon attackingDirection plus bas dans
 *  computePressDefenseTargets. */
const PRESS_2_2_1_OFFSETS: Array<{ dx: number; dy: number; role: string }> = [
  // Front line — ligne médiane (haut du terrain offensif)
  { dx: -120, dy: -460, role: 'front-left' },   // D2 typique
  { dx: +120, dy: -460, role: 'front-right' },  // D3 typique
  // Mid line — zone de relais (entre médiane et 3pt offense)
  { dx: -110, dy: -250, role: 'mid-left' },     // D1 typique
  { dx: +110, dy: -250, role: 'mid-right' },    // D4 typique
  // Sweeper — protecteur arrière (centre, près panier defense)
  { dx: 0,    dy: -50,  role: 'sweeper' },      // D5 typique
];

export function computePressDefenseTargets(
  state: AppState,
  stepIdx: number,
): { positions: Record<DefenderId, DefenderTarget>; matchupsApplied: Matchups } {
  const cur = state.steps[stepIdx];
  const off = activeOffense(cur.off, state.playerCount);
  const carrier = activeBallCarrier(cur, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);

  // Sens "vers le panier offense" : si hoop.y < 300 (attackingDirection='up',
  // panier defense en haut), alors le panier offense est en bas (y > hoop.y).
  // dy < 0 dans nos offsets = direction "vers offense", donc on flip si
  // hoop.y > 300 (attackingDirection='down').
  const dySign = hoop.y < 300 ? -1 : 1;

  const positions = {} as Record<DefenderId, DefenderTarget>;
  const matchupsApplied: Matchups = { ...baseMatchups };

  // Assigne dans l'ordre des défenseurs actifs aux 5 slots presse.
  defenderIds.forEach((dId, i) => {
    const slot = PRESS_2_2_1_OFFSETS[i % PRESS_2_2_1_OFFSETS.length];
    const x = hoop.x + slot.dx;
    const y = hoop.y + slot.dy * dySign;
    const matched = baseMatchups[dId];
    const manPos: Point = off[matched] ?? off[carrier] ?? { x: hoop.x, y: hoop.y };
    const ballPos: Point = off[carrier] ?? hoop;
    const ori = computeDefenderOrientation({
      defenderPos: { x, y },
      manPos,
      ballPos,
      isCarrierDefender: false,
      stance: 'sag',
    });
    positions[dId] = {
      x, y,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: matched,
      onScreen: false,
      switchedThisStep: false,
      orientation: ori.bodyOrientation,
      gazeOrientation: ori.gazeOrientation,
      facing: ori.facing,
      armBallSide: ori.armBallSide,
      armManSide: ori.armManSide,
      helpKind: 'none',
    };
  });

  return { positions, matchupsApplied };
}

/** Export pour les tests. */
export { PRESS_2_2_1_OFFSETS };
