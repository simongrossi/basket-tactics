import type { Point } from '../types';

export const COURT = {
  width: 600,
  height: 560,
  marginX: 20,
  marginY: 20,
  innerMaxX: 580,
  innerMaxY: 540,
} as const;

// Pour le mode terrain complet : on miroite la moitié basse autour de y=540 (ligne médiane).
// Le terrain s'étend alors de y=20 à y=1060 (panier opposé symétrique au panier "haut").
export const FULL_COURT_HEIGHT = 1080;
export const FULL_COURT_INNER_MAX_Y = 1060;
export const MIDLINE_Y = 540;
export const HOOP_OPPOSITE: Point = { x: 300, y: 1005 };

export const HOOP: Point = { x: 300, y: 75 };

export const PAINT = {
  x1: 240,
  y1: 20,
  x2: 360,
  y2: 210,
} as const;

export const THREE_POINT_RADIUS = 220;

export const PLAYER_RADIUS = 18;
export const BALL_RADIUS = 7;
