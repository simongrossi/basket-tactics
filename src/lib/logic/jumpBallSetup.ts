// E.2 — Jump ball / entre-deux initial.
//
// Pose les 10 joueurs autour du cercle central pour l'entre-deux de
// début de match. Configuration canonique :
//
//      O4 ●     ● O5         (back row, prêts à course)
//      O2 ●         ● O3     (wing positions)
//        O1 ● ● D1            (jumpers au centre)
//      D2 ●         ● D3
//      D4 ●     ● D5
//
// Le ballon sera tossé en l'air entre O1 et D1 ; les autres restent en
// position d'attente. Toutes les paires respectent MIN_CLEARANCE_PX = 34.
//
// Coordonnées calibrées pour le terrain demi-court (600×560) avec
// centre du cercle central à (300, 540) — au niveau de la ligne
// médiane. Compatible aussi avec le terrain complet (1080 hauteur).

import type {
  AttackerPositions,
  DefenderPositions,
  AttackerId,
} from '../types';

export interface JumpBallSetup {
  off: AttackerPositions;
  def: DefenderPositions;
  /** Sauteur de notre équipe (= attaquant), par convention O1. */
  jumper: AttackerId;
}

/**
 * Construit le setup d'entre-deux canonique. Le sauteur côté nous
 * est O1 ; D1 représente le sauteur adverse (notre matched défenseur
 * occupe la position symétrique).
 *
 * Convention positions : centre cercle à (300, 540). Les jumpers sont
 * à ~20 px de part et d'autre du centre (ligne médiane horizontale).
 * Les autres joueurs sont en arc autour du cercle à ~80 px du centre.
 */
export function buildJumpBallSetup(): JumpBallSetup {
  return {
    jumper: 'O1',
    off: {
      // Jumper côté nous + 4 attaquants autour.
      O1: { x: 282, y: 530 },  // jumper, légèrement à gauche du centre
      O2: { x: 170, y: 470 },  // wing gauche, haut
      O3: { x: 430, y: 470 },  // wing droit, haut
      O4: { x: 250, y: 440 },  // back-gauche
      O5: { x: 350, y: 440 },  // back-droit
    },
    def: {
      // Jumper adverse + 4 défenseurs.
      D1: { x: 318, y: 530 },  // jumper adverse, légèrement à droite
      D2: { x: 130, y: 510 },  // wing gauche, bas
      D3: { x: 470, y: 510 },  // wing droit, bas
      D4: { x: 250, y: 490 },  // matched O4, en face
      D5: { x: 350, y: 490 },  // matched O5, en face
    },
  };
}
