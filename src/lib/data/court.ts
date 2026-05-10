import type { Point } from '../types';

// =============================================================
// Échelle FIBA
// =============================================================
// SVG : 600 × 560 px, marge intérieure de 20 px → playing area
// 560 × 520 px représentant un demi-terrain FIBA de 15 m × 14 m.
// Échelle uniforme ≈ 37 px/m (560/15 = 37.33, 520/14 = 37.14, écart < 1%).
// On retient 37 px/m comme référence pour les calculs.
export const PX_PER_M = 37;

export const COURT = {
  width: 600,
  height: 560,
  marginX: 20,
  marginY: 20,
  innerMaxX: 580,
  innerMaxY: 540,
} as const;

// =============================================================
// Mode terrain complet (miroir autour de la ligne médiane)
// =============================================================
export const FULL_COURT_HEIGHT = 1080;
export const FULL_COURT_INNER_MAX_Y = 1060;
export const MIDLINE_Y = 540;
export const HOOP_OPPOSITE: Point = { x: 300, y: 1005 };

// =============================================================
// Cercle / panier (FIBA : centre à 1.575 m de la baseline)
// =============================================================
// 1.575 m × 37 ≈ 58 px ; on conserve y=75 pour rester compatible avec
// l'historique des templates et règles (faible dérive, ~3 px).
export const HOOP: Point = { x: 300, y: 75 };
export const HOOP_RADIUS = 9; // anneau visuel

// =============================================================
// Backboard
// =============================================================
// Bord intérieur (côté terrain) à 1.20 m de la baseline = 44 px → y=64.
// Largeur 1.80 m = 67 px, centré sur x=300.
export const BACKBOARD_Y = 64;
export const BACKBOARD_HALF_WIDTH = 33;

// =============================================================
// Raquette (paint) FIBA : 4.90 m × 5.80 m
// =============================================================
// Largeur 4.90 m × 37 = 181 px → x=210..390 (centré sur x=300)
// Profondeur 5.80 m × 37 = 215 px → y=20..235 (depuis baseline y=20)
export const PAINT = {
  x1: 210,
  y1: 20,
  x2: 390,
  y2: 235,
} as const;

// Ligne des lancers francs
export const FT_LINE_Y = 235;
// Cercle des LF : rayon 1.80 m
export const FT_CIRCLE_RADIUS = 67;

// =============================================================
// Ligne à 3 points
// =============================================================
// FIBA : 6.75 m du centre du panier
export const THREE_POINT_RADIUS = 250; // 6.75 × 37 ≈ 250
// Sections droites des coins : à 0.90 m de la touche
export const CORNER_3PT_X_LEFT = 53;   // 20 + 33
export const CORNER_3PT_X_RIGHT = 547; // 580 - 33
// Le segment droit du coin va de la baseline (y=20) jusqu'à où l'arc
// rencontre x=53 / x=547. Calcul :
//   distance(HOOP, arc point) = 250
//   à x=53 : (300-53)² + (y-75)² = 250²
//            247² + (y-75)² = 62500
//            (y-75)² = 1491
//            y - 75 ≈ 38.6
//            y ≈ 114
export const CORNER_3PT_Y = 114;

// =============================================================
// Zone restreinte (no-charge semicircle) — 1.25 m
// =============================================================
export const RESTRICTED_AREA_RADIUS = 46;

// =============================================================
// Cercle central (rond central) — 1.80 m de rayon
// =============================================================
export const CENTER_CIRCLE_RADIUS = 67;

// =============================================================
// Géométrie terrain — axes et tolérances
// =============================================================
// Ligne médiane verticale : axe x=300 (centre des paniers et du terrain).
// Toute la logique côté ballon / côté fort / côté faible s'appuie dessus.
export const COURT_CENTERLINE_X = 300;
// Tolérance latérale pour considérer un point "dans l'axe" (ni gauche ni
// droite). Utilisée par ballSide / attackerSide pour produire 0 quand le
// porteur est dans cette bande centrale.
export const CARRIER_SIDE_TOLERANCE_PX = 30;

// =============================================================
// Joueurs
// =============================================================
export const PLAYER_RADIUS = 16;
export const BALL_RADIUS = 7;

// Rayons dérivés pour collision / interaction. Centralisés ici pour éviter
// les `PLAYER_RADIUS + N` éparpillés dans les composants et le moteur.
//
//  - OBSTACLE : rayon de "blocage" pendant le playback (curve-around).
//  - PICK     : tolérance de clic souris pour sélectionner un joueur.
//  - CLUSTER_BASE_R : rayon d'agrégation pour le clustering écran.
//  - CLUSTER_LINK_DIST : distance max entre deux joueurs liés (poseur ↔ déf).
//  - MIN_CLEARANCE : distance minimale entre deux centres joueur (anti-overlap).
export const PLAYER_OBSTACLE_RADIUS_PX = PLAYER_RADIUS + 2;
export const PLAYER_PICK_RADIUS_PX = PLAYER_RADIUS + 4;
export const PLAYER_CLUSTER_BASE_R_PX = PLAYER_RADIUS + 4;
export const PLAYER_CLUSTER_LINK_DIST_PX = PLAYER_RADIUS * 4;
export const PLAYER_MIN_CLEARANCE_PX = PLAYER_RADIUS * 2 + 2;
