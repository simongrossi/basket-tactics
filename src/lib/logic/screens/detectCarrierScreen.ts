// Détection de l'écran SUR LE PORTEUR (pick-and-roll, drag, ghost, etc.).
//
// La détection est purement géométrique : on cherche, parmi les attaquants
// non-porteurs, celui qui minimise un score combinant
//   distance(poseur, carrierDef) + 0.5 * distance(poseur, porteur)
// et qui passe le filtre d'intention (vélocité orientée vers le couple).
//
// L'override utilisateur (`forcedScreener`) court-circuite tous les checks :
// si l'utilisateur a tranché, on n'argumente pas.

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  DetectedScreen,
  Matchups,
  Point,
} from '../../types';
import { distance } from '../geometry';
import { hasScreenIntent } from './helpers';

/**
 * Détecte automatiquement un écran porteur :
 * un attaquant non-porteur se positionne près du défenseur du porteur.
 *
 * TODO palier 4 : la détection actuelle est basée sur la proximité.
 * Améliorations possibles :
 *  - utiliser explicitement les annotations 'screen' dessinées par l'utilisateur
 *  - vérifier que le poseur d'écran est bien orienté vers le défenseur (pas
 *    juste à côté par hasard)
 *  - gérer les écrans en mouvement (slip, ghost screen)
 *
 * Pour l'instant, on cherche le poseur d'écran le plus probable parmi tous
 * les attaquants non-porteurs : celui qui minimise (dist au défenseur du
 * porteur) + 0.5 * (dist au porteur).
 */
export function detectScreen(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  matchups: Matchups,
  defenderPositions: Record<DefenderId, Point>,
  screenRadius: number,
  forcedScreener?: AttackerId,
  /** Positions des attaquants à l'étape précédente. Si fourni, on filtre les
   *  candidats par INTENTION : leur velocity doit avoir une composante non
   *  négligeable vers le couple porteur/défenseur. Sans cet historique, on
   *  retombe sur le critère de proximité pure (rétrocompat). */
  prevOff?: AttackerPositions
): DetectedScreen | null {
  const carrier = off[ballCarrier];
  if (!carrier) return null;

  let carrierDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
    if (o === ballCarrier) carrierDef = d;
  });
  if (!carrierDef) return null;

  // Override utilisateur : l'attaquant désigné est le poseur, on saute
  // les checks de proximité (l'utilisateur a tranché).
  if (forcedScreener && forcedScreener !== ballCarrier && off[forcedScreener]) {
    let screenerDef: DefenderId | null = null;
    (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
      if (o === forcedScreener) screenerDef = d;
    });
    if (!screenerDef) return null;
    return {
      screener: forcedScreener,
      screenerDef,
      carrier: ballCarrier,
      carrierDef,
      screenerPos: off[forcedScreener],
    };
  }

  const cdPos = defenderPositions[carrierDef];

  let bestScreener: AttackerId | null = null;
  let bestScore = Infinity;

  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, p]) => {
    if (oId === ballCarrier) return;
    const dToCD = distance(p, cdPos);
    if (dToCD > screenRadius) return;
    const dToCarrier = distance(p, carrier);
    if (dToCarrier > 80) return;
    if (!hasScreenIntent(oId, p, cdPos, prevOff)) return;
    const score = dToCD + dToCarrier * 0.5;
    if (score < bestScore) {
      bestScore = score;
      bestScreener = oId;
    }
  });

  if (!bestScreener) return null;

  let screenerDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
    if (o === bestScreener) screenerDef = d;
  });
  if (!screenerDef) return null;

  return {
    screener: bestScreener,
    screenerDef,
    carrier: ballCarrier,
    carrierDef,
    screenerPos: off[bestScreener],
  };
}
