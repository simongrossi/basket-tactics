// C.4 — Pre-rotation : détection d'un écran IMMINENT (pas encore posé).
//
// Aujourd'hui, l'écran est détecté quand le poseur est DÉJÀ proche du
// défenseur du porteur (≤ screenRadius). Avant ça, la défense ne réagit
// pas. Or basket réel : un défenseur EXPÉRIMENTÉ anticipe l'écran qui
// arrive et pre-shifter (épaules tournées, pied préparé sur la route
// over/under).
//
// V1 : helper qui détecte un écran "imminent" = un attaquant ≠ porteur
// en MOUVEMENT vers le défenseur du porteur, encore hors du rayon de
// détection mais avec une trajectoire qui l'amène DANS les X px à venir.
//
// Critères (tous obligatoires) :
//   1. Attaquant à dist ∈ [screenRadius, screenRadius * 2] du carrierDef
//      (au-delà du seuil détection mais dans la zone proche)
//   2. Vélocité (prev → cur) AVEC composante positive vers le carrierDef
//      (l'attaquant approche, ne fuit pas)
//   3. Attaquant à dist ≤ 100px du porteur (vraiment dans la zone PnR)
//
// Returns l'attaquant identifié + sa position, ou null.

import type {
  AttackerId,
  AttackerPositions,
  DefenderPositions,
  Matchups,
  Point,
} from '../../types';
import { distance } from '../geometry';

export interface ImminentScreen {
  /** L'attaquant en approche (futur poseur). */
  screener: AttackerId;
  /** Position courante de l'attaquant. */
  screenerPos: Point;
  /** Position courante du défenseur du porteur. */
  carrierDefPos: Point;
  /** Distance actuelle attaquant ↔ carrierDef. */
  distance: number;
}

const PROXIMITY_TO_CARRIER_PX = 100;

export function detectImminentScreen(
  off: AttackerPositions,
  prevOff: AttackerPositions | null,
  ballCarrier: AttackerId,
  matchups: Matchups,
  defenderPositions: DefenderPositions,
  screenRadius: number
): ImminentScreen | null {
  if (!prevOff) return null;
  const carrier = off[ballCarrier];
  if (!carrier) return null;

  // Identifier le carrierDef.
  let carrierDef: string | null = null;
  for (const [dId, attId] of Object.entries(matchups)) {
    if (attId === ballCarrier) {
      carrierDef = dId;
      break;
    }
  }
  if (!carrierDef) return null;
  const carrierDefPos = defenderPositions[carrierDef as keyof DefenderPositions];
  if (!carrierDefPos) return null;

  let best: ImminentScreen | null = null;
  let bestDist = Infinity;

  for (const oId of Object.keys(off) as AttackerId[]) {
    if (oId === ballCarrier) continue;
    const cur = off[oId];
    const prev = prevOff[oId];
    if (!cur || !prev) continue;

    const distToCD = distance(cur, carrierDefPos);
    // Hors du seuil détection mais proche : zone "imminent".
    if (distToCD <= screenRadius) continue; // déjà détecté en écran réel
    if (distToCD > screenRadius * 2) continue; // trop loin pour être imminent

    const distToCar = distance(cur, carrier);
    if (distToCar > PROXIMITY_TO_CARRIER_PX) continue;

    // Vélocité de l'attaquant : direction prev → cur. Si l'attaquant se
    // RAPPROCHE du carrierDef, le dot produit avec (cur - prev) doit être
    // positif sur l'axe (cur → carrierDef).
    const moveX = cur.x - prev.x;
    const moveY = cur.y - prev.y;
    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen < 5) continue; // statique, pas en approche
    const toCDx = carrierDefPos.x - cur.x;
    const toCDy = carrierDefPos.y - cur.y;
    const toCDlen = Math.hypot(toCDx, toCDy) || 1;
    const dot = (moveX * toCDx + moveY * toCDy) / (moveLen * toCDlen);
    if (dot < 0.3) continue; // pas de mouvement franc vers le carrierDef

    if (distToCD < bestDist) {
      bestDist = distToCD;
      best = {
        screener: oId,
        screenerPos: cur,
        carrierDefPos,
        distance: distToCD,
      };
    }
  }

  return best;
}
