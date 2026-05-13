// F.3 — Free Throw rebound positioning.
//
// Génère les 10 positions standards autour de la raquette pour un lancer
// franc FIBA (5v5). Disposition canonique :
//
//                  HOOP (300, 75)
//      ┌──────────────────────────────────┐
//      │  D5 [block-G]  ────  [block-D] D4│  ← rebond défense (contre baseline)
//      │                                  │
//      │  O5 [slot-G]   ────  [slot-D] O4 │  ← rebond offense (au-dessus blocks)
//      │                                  │
//      │                                  │
//      │           [shooter]              │
//      │           O1 (LF line)           │
//      │           D1 (trail)             │
//      │                                  │
//      └──────────────────────────────────┘
//   O2/D2 (outlet 3pt gauche)   O3/D3 (outlet 3pt droite)
//
// Toutes les paires respectent PLAYER_MIN_CLEARANCE_PX = 34 px (cf.
// docs/PLAYER-CLEARANCE.md). Le panier de référence est HOOP (300, 75).

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
} from '../types';
import { HOOP, PAINT, FT_LINE_Y } from '../data/court';

export interface FreeThrowPositions {
  off: AttackerPositions;
  def: DefenderPositions;
  /** Tireur (porteur du ballon pendant le LF) — par convention O1. */
  shooter: AttackerId;
}

/**
 * Construit le setup standard d'un lancer franc 5v5 FIBA. Le panier de
 * référence est HOOP (300, 75) — sens "attaque vers le haut".
 *
 *  - O1 = tireur sur la ligne LF
 *  - D4, D5 = blocks défense (les plus proches du panier)
 *  - O4, O5 = slots offense (juste au-dessus des blocks)
 *  - D1 = trail derrière le shooter (free defender côté faible)
 *  - O2, O3 = outlets 3pt (transition rapide après rebond)
 *  - D2, D3 = matched sur O2, O3
 *
 * Les positions sont calibrées pour respecter MIN_PLAYER_CLEARANCE_PX
 * et rester dans les limites du terrain.
 */
export function buildFreeThrowSetup(): FreeThrowPositions {
  // Constantes locales calibrées sur le terrain FIBA (cf. data/court.ts) :
  // - Paint x1=210, x2=390 (largeur 180 px)
  // - HOOP (300, 75), FT_LINE_Y = 235
  // - Block intérieur = paint edge + 25 px d'offset (≈ position réglementaire
  //   à 50 cm du panier)
  const lanePaddingPx = 25;
  const blockY = 55;       // contre la baseline (y=20), offset 35 px
  const slotY = 95;        // juste au-dessus du block (40 px above = ≥ clearance)
  const shooterY = FT_LINE_Y + 15; // 250, légèrement derrière la ligne LF
  const trailY = shooterY + 70;    // D1 (300, 320), derrière O1 (clearance 70)
  const outletY = 240;
  const outletXLeft = 110;
  const outletXRight = HOOP.x * 2 - outletXLeft; // symétrie : 490
  const defOutletYOffset = 30;     // D2/D3 légèrement derrière O2/O3 (clearance)
  const defOutletXInner = 30;      // D2/D3 à 30 px vers l'intérieur (clearance)

  return {
    shooter: 'O1',
    off: {
      O1: { x: HOOP.x, y: shooterY },
      O2: { x: outletXLeft, y: outletY },
      O3: { x: outletXRight, y: outletY },
      O4: { x: PAINT.x2 - lanePaddingPx, y: slotY },
      O5: { x: PAINT.x1 + lanePaddingPx, y: slotY },
    },
    def: {
      D1: { x: HOOP.x, y: trailY },
      D2: { x: outletXLeft + defOutletXInner, y: outletY + defOutletYOffset },
      D3: { x: outletXRight - defOutletXInner, y: outletY + defOutletYOffset },
      D4: { x: PAINT.x2 - lanePaddingPx, y: blockY },
      D5: { x: PAINT.x1 + lanePaddingPx, y: blockY },
    },
  };
}
