// Inbound (remise en jeu) — pose les 5 attaquants en setup canonique
// pour étudier les systèmes BLOB / SLOB. Pattern aligné sur
// `freeThrowSetup.ts` (F.3) :
//  - Passe le step en `context: 'inbound-*'`
//  - Place le passeur ~10 px hors-ligne (visible mais marqué)
//  - Box set classique pour BLOB ; alignement diagonale pour SLOB
//  - Défense en man-to-man face à face avec chaque attaquant
//
// V1 : 3 zones standards FIBA (baseline + 2 sidelines). V2 (si besoin)
// : compteur 5 s violation, plusieurs box variantes.

import type { AttackerId, AttackerPositions, DefenderId, Point, InboundSide } from '@/lib/types';
import { COURT, HOOP } from '@/lib/data/court';

export interface InboundPositions {
  off: AttackerPositions;
  /** Override des défenseurs (man-to-man face à face). Posé sur
   *  `step.defenseOverrides` pour figer le placement. */
  def: Record<DefenderId, Point>;
  /** ID du passeur (= `ballCarrier` à poser sur le step). */
  inbounder: AttackerId;
}

const PASSER_OFFSET_PX = 12;

/**
 * Pose les 5 attaquants en setup canonique pour la zone demandée.
 * O1 est par défaut le passeur (inbounder). Les autres se placent en
 * Box (BLOB) ou en diagonale spacing (SLOB).
 */
export function buildInboundSetup(side: InboundSide): InboundPositions {
  switch (side) {
    case 'inbound-baseline':
      return buildBaselineBlobBox();
    case 'inbound-sideline-low':
      return buildSidelineLow();
    case 'inbound-sideline-high':
      return buildSidelineHigh();
  }
}

// ============================================================
// BLOB — baseline out-of-bounds (Box set classique)
// ============================================================

function buildBaselineBlobBox(): InboundPositions {
  // Passer juste hors-ligne, derrière le panier.
  const passerX = HOOP.x;
  const passerY = COURT.marginY - PASSER_OFFSET_PX; // = 8, hors-terrain
  // Box : 4 joueurs sur les 4 coins de la raquette / lane.
  const off: AttackerPositions = {
    O1: { x: passerX, y: passerY }, // passeur
    O2: { x: 250, y: 95 }, // short corner gauche
    O3: { x: 350, y: 95 }, // short corner droite
    O4: { x: 240, y: 170 }, // wing gauche
    O5: { x: 360, y: 170 }, // wing droite
  };
  // Défense face-à-face : chaque défenseur entre son homme et le panier.
  const def: Record<DefenderId, Point> = {
    D1: { x: passerX, y: 35 }, // garde le passeur (front baseline)
    D2: { x: 250, y: 75 }, // sur O2
    D3: { x: 350, y: 75 }, // sur O3
    D4: { x: 240, y: 130 }, // sur O4
    D5: { x: 360, y: 130 }, // sur O5
  };
  return { off, def, inbounder: 'O1' };
}

// ============================================================
// SLOB low — sideline out-of-bounds côté offensif (= dans les 30 px
// près de la ligne de fond, ailier qui inbound vers l'attaque)
// ============================================================

function buildSidelineLow(): InboundPositions {
  // Passer sur le côté droit, à hauteur du free throw line / petit
  // côté offensif.
  const passerX = COURT.innerMaxX + PASSER_OFFSET_PX; // 592
  const passerY = 180;
  const off: AttackerPositions = {
    O1: { x: passerX, y: passerY }, // passeur
    O2: { x: 380, y: 90 }, // wing court
    O3: { x: 200, y: 130 }, // wing weak side
    O4: { x: 320, y: 230 }, // top of key
    O5: { x: 470, y: 350 }, // safety en haut (transition defense)
  };
  const def: Record<DefenderId, Point> = {
    D1: { x: 550, y: 200 }, // sur le passeur (intercepter passe)
    D2: { x: 380, y: 130 }, // sur O2
    D3: { x: 200, y: 170 }, // sur O3
    D4: { x: 320, y: 270 }, // sur O4
    D5: { x: 470, y: 390 }, // sur O5
  };
  return { off, def, inbounder: 'O1' };
}

// ============================================================
// SLOB high — sideline côté défensif (transition / advance the ball)
// ============================================================

function buildSidelineHigh(): InboundPositions {
  // Passer sur le côté droit, dans la moitié arrière (= y élevé en
  // demi-court vue HOOP en haut).
  const passerX = COURT.innerMaxX + PASSER_OFFSET_PX;
  const passerY = 440;
  const off: AttackerPositions = {
    O1: { x: passerX, y: passerY }, // passeur
    O2: { x: 420, y: 460 }, // outlet rapproché
    O3: { x: 200, y: 460 }, // outlet weak side
    O4: { x: 300, y: 380 }, // relai milieu
    O5: { x: 300, y: 250 }, // intérieur, courge vers panier
  };
  const def: Record<DefenderId, Point> = {
    D1: { x: 550, y: 460 }, // sur le passeur
    D2: { x: 420, y: 500 }, // sur O2
    D3: { x: 200, y: 500 }, // sur O3
    D4: { x: 300, y: 420 }, // sur O4
    D5: { x: 300, y: 290 }, // sur O5
  };
  return { off, def, inbounder: 'O1' };
}
