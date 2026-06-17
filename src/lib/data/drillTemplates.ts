// Exercices exemples (drills) prêts à insérer dans une séance.
//
// Complètent le « Bloc libre » vide : ce sont des blocs LIBRES pré-remplis
// (titre + durée conseillée + consignes détaillées), que le coach insère dans
// la séance courante puis ajuste. Le contenu vit dans `notes` (multi-ligne).

import type { SessionBlockTemplate } from './practiceSessions';

/** Un exercice exemple = un bloc libre pré-rempli + une catégorie d'affichage. */
export interface DrillTemplate extends SessionBlockTemplate {
  kind: 'free';
  /** Catégorie pour regrouper dans le sélecteur (ex. « Transition », « Tir »). */
  category: string;
}

export const DRILL_TEMPLATES: DrillTemplate[] = [
  {
    kind: 'free',
    category: 'Transition',
    title: 'Philadelphia (transition + tir en continu)',
    durationMin: 15,
    notes:
      "Exercice de transition + tir en continu (conditionnement game-speed).\n" +
      "Mise en place : 3 lignes en fond de terrain — 2 ailiers sur les côtés, " +
      "1 meneur au centre avec le ballon. Un rebondeur sous le panier de départ.\n" +
      "Déroulé :\n" +
      "1) Le meneur monte la balle, les 2 ailiers remplissent les couloirs larges.\n" +
      "2) 2 passes minimum avant la ligne des LF, finition au panier opposé " +
      "(layup côté, ou tir à mi-distance sur passe).\n" +
      "3) Le tireur prend SON rebond, fait l'outlet à un ailier, et la vague " +
      "repart immédiatement dans l'autre sens — sans arrêt.\n" +
      "4) Sprint de repli défensif entre chaque panier. 3 à 4 min par vague, " +
      "puis rotation des lignes.\n" +
      "Clés : passes à hauteur de poitrine EN COURSE, couloirs larges, dernier " +
      "appui équilibré. Erreur fréquente : ralentir avant le tir / passes molles.",
  },
  {
    kind: 'free',
    category: 'Tir',
    title: 'Catch-and-shoot sur passe (5 spots)',
    durationMin: 12,
    notes:
      "5 spots (2 corners, 2 ailes, axe). Un passeur sous le cercle, le tireur " +
      "tourne sur les spots : passe rentrante → catch-and-shoot → enchaîner.\n" +
      "Objectif chiffré par spot (ex. 4/6 pour valider). Pieds prêts AVANT la " +
      "balle, épaules face au cercle. Variante : closeout d'un défenseur passif.",
  },
  {
    kind: 'free',
    category: 'Transition',
    title: 'Supériorité 3c2 → 2c1',
    durationMin: 15,
    notes:
      "Vague 3c2 : lire le défenseur du haut, attaquer le cercle, finir ou " +
      "extra-passe (pas de tir contesté). Au rebond, 2 défenseurs partent en 2c1 " +
      "dans l'autre sens.\n" +
      "Clés : décision avant la ligne des LF, occuper les 3 couloirs, finir des " +
      "deux mains. Erreur fréquente : sur-dribble / forcer le 1er tir.",
  },
];
