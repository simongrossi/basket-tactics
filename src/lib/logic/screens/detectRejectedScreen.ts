// Détection des écrans REJETÉS (B2).
//
// Un reject = le porteur s'approche d'un poseur (anticipé en couverture par
// la défense), puis VIRE dans la direction opposée avant le contact. Lecture
// offensive classique contre une couverture trop agressive (hedge / blitz) :
// la défense a sur-anticipé, l'attaque exploite.
//
// Détection à partir de l'historique (step N-1 → step N) :
//
//  1. Le porteur a bougé significativement (≥ 25 px).
//  2. À step N-1, un attaquant ≠ porteur était proche du défenseur du porteur
//     (≤ screenRadius × 1.5) ET proche du porteur (≤ 80 px) → candidat poseur.
//  3. À step N, le mouvement du porteur a une composante NÉGATIVE sur l'axe
//     porteur → poseur (le porteur s'éloigne plutôt que d'approcher).
//  4. La distance porteur ↔ poseur a augmenté d'au moins 20 px entre N-1 et N.
//
// Si tous les critères sont remplis, on retourne `RejectedScreen` avec les
// IDs concernés + métriques de distance (pour le diagnostic coach). Sinon
// `null`.
//
// V1 — usage diagnostique uniquement. Pas de modification du moteur
// défensif : on suppose que la défense réelle s'est positionnée pour un
// écran qui n'a pas eu lieu, et le coach voit l'écart via le diag.

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Matchups,
} from '../../types';
import { distance } from '../geometry';

export interface RejectedScreen {
  /** L'attaquant qui aurait dû poser l'écran (anticipé par la défense). */
  screener: AttackerId;
  /** Son défenseur, qui a probablement sur-engagé à l'anticipation. */
  screenerDef: DefenderId;
  /** Le porteur qui a rejeté l'écran. */
  carrier: AttackerId;
  /** Le défenseur du porteur, lui aussi sur-engagé sur la couverture
   *  attendue (over / hedge / etc.). */
  carrierDef: DefenderId;
  /** Distance porteur ↔ poseur au step N-1 (≤ screenRadius × 1.5 par def). */
  prevDistance: number;
  /** Distance porteur ↔ poseur au step N (toujours > prevDistance + 20). */
  curDistance: number;
  /** Composante du vecteur mouvement du porteur vers le poseur, dans
   *  [-1, 0]. -1 = retraite directe, 0 ≈ -0.3 = retraite latérale. Utile
   *  pour distinguer "reject net" vs "reject de marge". */
  awayness: number;
}

const MIN_CARRIER_MOVEMENT_PX = 25;
const SCREENER_PROXIMITY_TO_CARRIER_PX = 80;
const MIN_DIVERGENCE_PX = 20;
const AWAYNESS_THRESHOLD = -0.3; // dot < -0.3 = mouvement opposé au poseur

export function detectRejectedScreen(
  off: AttackerPositions,
  prevOff: AttackerPositions | null,
  ballCarrier: AttackerId,
  matchups: Matchups,
  prevDefenderPositions: DefenderPositions,
  screenRadius: number
): RejectedScreen | null {
  if (!prevOff) return null;

  const prevC = prevOff[ballCarrier];
  const curC = off[ballCarrier];
  if (!prevC || !curC) return null;

  const moveX = curC.x - prevC.x;
  const moveY = curC.y - prevC.y;
  const moveLen = Math.hypot(moveX, moveY);
  if (moveLen < MIN_CARRIER_MOVEMENT_PX) return null;

  // Identifier le carrierDef depuis le matchups (entries N-1).
  let carrierDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, a]) => {
    if (a === ballCarrier) carrierDef = d;
  });
  if (!carrierDef) return null;
  const prevCDPos = prevDefenderPositions[carrierDef];
  if (!prevCDPos) return null;

  // Chercher le meilleur candidat poseur à N-1.
  // Note : on évite forEach + capture pour préserver la narrowing TS sur
  // `bestScreener` après le if-return ci-dessous.
  let bestScreener: AttackerId | null = null;
  let bestScore = Infinity;
  for (const oId of Object.keys(prevOff) as AttackerId[]) {
    if (oId === ballCarrier) continue;
    const prevPos = prevOff[oId];
    if (!prevPos) continue;
    const dToCD = distance(prevPos, prevCDPos);
    if (dToCD > screenRadius * 1.5) continue;
    const dToCar = distance(prevPos, prevC);
    if (dToCar > SCREENER_PROXIMITY_TO_CARRIER_PX) continue;
    // Même score que `detectScreen` (proximité défenseur du porteur + porteur).
    const score = dToCD + dToCar * 0.5;
    if (score < bestScore) {
      bestScore = score;
      bestScreener = oId;
    }
  }

  if (!bestScreener) return null;

  // Vérifier que le porteur s'éloigne effectivement à N.
  const curScreenerPos = off[bestScreener];
  if (!curScreenerPos) return null;

  const toScreenerX = curScreenerPos.x - prevC.x;
  const toScreenerY = curScreenerPos.y - prevC.y;
  const toScreenerLen = Math.hypot(toScreenerX, toScreenerY) || 1;
  const awayness =
    (moveX * toScreenerX + moveY * toScreenerY) / (moveLen * toScreenerLen);

  if (awayness > AWAYNESS_THRESHOLD) return null;

  // Bonus : la distance porteur ↔ poseur doit avoir AUGMENTÉ.
  const prevScreenerPos = prevOff[bestScreener];
  if (!prevScreenerPos) return null;
  const prevDistance = distance(prevC, prevScreenerPos);
  const curDistance = distance(curC, curScreenerPos);
  if (curDistance < prevDistance + MIN_DIVERGENCE_PX) return null;

  // Identifier le screenerDef.
  let screenerDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, a]) => {
    if (a === bestScreener) screenerDef = d;
  });
  if (!screenerDef) return null;

  return {
    screener: bestScreener,
    screenerDef,
    carrier: ballCarrier,
    carrierDef,
    prevDistance,
    curDistance,
    awayness,
  };
}
