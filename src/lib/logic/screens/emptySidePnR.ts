// Détection EMPTY SIDE PnR (B5).
//
// Un PnR "côté faible vide" se produit quand le porteur et le poseur
// occupent un côté du terrain où AUCUN autre attaquant n'est présent.
//
// Conséquences tactiques :
//  - **ice impossible** : pas de fond à fermer côté faible → forcer baseline
//    enverrait le porteur dans le vide (1c0 vers le panier).
//  - **under naturel** : pas de skip pass à défendre, le porteur n'a personne
//    à servir derrière l'écran.
//  - Le rim protector (low man) ne tag pas le roller (personne à laisser),
//    il peut prendre directement le drive.
//
// V1 : diagnostic uniquement (recommandation au coach). Pas de modification
// automatique de la couverture.

import type {
  AttackerId,
  AttackerPositions,
  DetectedScreen,
  Point,
} from '../../types';
import { HOOP } from '../../data/court';

/**
 * Vérifie si le PnR détecté est sur le côté vide du terrain.
 *
 * Calcul :
 *  1. Vecteur perpendiculaire à l'axe poseur→panier (= direction "côté").
 *  2. `sideOfCarrier` ∈ [-1, 1] = projection (carrier - screener) sur cette
 *     perpendiculaire → indique de quel côté est le porteur (et donc la
 *     route attendue).
 *  3. Pour chaque AUTRE attaquant ≠ porteur, ≠ poseur : projeter
 *     (att - screener) sur la perpendiculaire. Si `dot > 0` et `sideOfCarrier
 *     > 0` (ou inversement), l'attaquant est du même côté que le porteur
 *     → ce n'est PAS empty side.
 *
 * Retourne `true` si aucun autre attaquant n'est du même côté que le porteur.
 */
export function isEmptySidePnR(
  screen: DetectedScreen,
  off: AttackerPositions,
  hoop: Point = HOOP
): boolean {
  const carrierPos = off[screen.carrier];
  const screenerPos = off[screen.screener];
  if (!carrierPos || !screenerPos) return false;

  // Axe poseur → panier.
  const nx = hoop.x - screenerPos.x;
  const ny = hoop.y - screenerPos.y;
  const nLen = Math.hypot(nx, ny) || 1;
  // Perpendiculaire (rotation 90°).
  const perpX = -ny / nLen;
  const perpY = nx / nLen;

  // Côté du porteur par rapport à l'axe.
  const sToCx = carrierPos.x - screenerPos.x;
  const sToCy = carrierPos.y - screenerPos.y;
  const sideOfCarrier = sToCx * perpX + sToCy * perpY;

  // Tolérance : si le porteur est quasi sur l'axe (|side| < 5 px), pas de
  // notion de côté → on retourne false (pattern indéterminé, mieux vaut ne
  // pas pousser de diagnostic erroné).
  if (Math.abs(sideOfCarrier) < 5) return false;

  const carrierSide = Math.sign(sideOfCarrier);

  // Parcourir les autres attaquants.
  for (const oId of Object.keys(off) as AttackerId[]) {
    if (oId === screen.carrier) continue;
    if (oId === screen.screener) continue;
    const att = off[oId];
    if (!att) continue;
    const dx = att.x - screenerPos.x;
    const dy = att.y - screenerPos.y;
    const sideOfAtt = dx * perpX + dy * perpY;
    // Tolérance similaire : un attaquant quasi sur l'axe ne compte pas
    // pour la définition du "côté vide".
    if (Math.abs(sideOfAtt) < 5) continue;
    if (Math.sign(sideOfAtt) === carrierSide) {
      return false; // au moins un autre attaquant côté porteur → pas empty
    }
  }
  return true;
}
