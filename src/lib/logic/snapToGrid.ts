// Snap-to-grid pendant le drag (Ctrl enfoncé).
//
// "Magnétise" la position du curseur sur les lignes clés du terrain FIBA.
// Seuil par défaut : 8 px. Si aucun snap dans le seuil, retourne le point
// inchangé. Les snaps SUR DES POINTS (blocs bas) priment sur les snaps de
// ligne — plus précis.
//
// Targets :
//  - Ligne médiane verticale (x = COURT_CENTERLINE_X = 300)
//  - Bords de la raquette (PAINT.x1, PAINT.x2, PAINT.y1, PAINT.y2)
//  - Ligne de free throw (FT_LINE_Y = 235)
//  - Arc à 3 points (rayon THREE_POINT_RADIUS = 250 depuis HOOP)
//  - Blocs bas (HOOP.x ± 70, HOOP.y + 80) ≈ (230, 155) et (370, 155)
//
// Note V1 : on snape autour de HOOP (panier "top" du demi-terrain). En mode
// fullCourt, on pourrait étendre à HOOP_OPPOSITE mais V1 reste sur le panier
// défendu. Le caller passe `hoop` explicitement pour permettre l'extension.

import type { Point } from '../types';
import {
  COURT_CENTERLINE_X,
  HOOP,
  PAINT,
  FT_LINE_Y,
  THREE_POINT_RADIUS,
} from '../data/court';

export interface SnapResult {
  /** Position après snap (= input p si aucun snap trouvé). */
  point: Point;
  /** Tag de la ligne / point sur lequel le snap a opéré, pour visu/debug.
   *  `null` si pas de snap. */
  snappedTo: SnapTarget | null;
}

export type SnapTarget =
  | 'midline'
  | 'paint-left'
  | 'paint-right'
  | 'paint-top'
  | 'paint-bottom'
  | 'free-throw'
  | 'three-point-arc'
  | 'block-left'
  | 'block-right';

const DEFAULT_THRESHOLD = 8;

interface Candidate {
  point: Point;
  dist: number;
  target: SnapTarget;
}

/** Snape le point `p` sur la ligne/point la plus proche dans `threshold`.
 *  Si plusieurs candidats sont dans le seuil, on retient le plus proche. */
export function snapToGrid(
  p: Point,
  threshold: number = DEFAULT_THRESHOLD,
  hoop: Point = HOOP
): SnapResult {
  const candidates: Candidate[] = [];

  // ----- Points spécifiques (blocs bas) -----
  // Blocs FIBA : à ±70 px de l'axe panier, 80 px en profondeur depuis la
  // baseline. Pour HOOP top (y=75), le bloc est à y=155.
  const blockY = hoop.y + 80;
  const blockLeft = { x: hoop.x - 70, y: blockY };
  const blockRight = { x: hoop.x + 70, y: blockY };
  const dBlockL = Math.hypot(p.x - blockLeft.x, p.y - blockLeft.y);
  if (dBlockL < threshold) {
    candidates.push({ point: blockLeft, dist: dBlockL, target: 'block-left' });
  }
  const dBlockR = Math.hypot(p.x - blockRight.x, p.y - blockRight.y);
  if (dBlockR < threshold) {
    candidates.push({ point: blockRight, dist: dBlockR, target: 'block-right' });
  }

  // ----- Lignes verticales -----
  // Médiane
  const dMidline = Math.abs(p.x - COURT_CENTERLINE_X);
  if (dMidline < threshold) {
    candidates.push({
      point: { x: COURT_CENTERLINE_X, y: p.y },
      dist: dMidline,
      target: 'midline',
    });
  }
  // Bords raquette (gauche / droite)
  const dPaintL = Math.abs(p.x - PAINT.x1);
  if (dPaintL < threshold) {
    candidates.push({
      point: { x: PAINT.x1, y: p.y },
      dist: dPaintL,
      target: 'paint-left',
    });
  }
  const dPaintR = Math.abs(p.x - PAINT.x2);
  if (dPaintR < threshold) {
    candidates.push({
      point: { x: PAINT.x2, y: p.y },
      dist: dPaintR,
      target: 'paint-right',
    });
  }

  // ----- Lignes horizontales -----
  // Baseline (top du paint)
  const dPaintT = Math.abs(p.y - PAINT.y1);
  if (dPaintT < threshold) {
    candidates.push({
      point: { x: p.x, y: PAINT.y1 },
      dist: dPaintT,
      target: 'paint-top',
    });
  }
  // Fond de la raquette (= ligne LF)
  const dPaintB = Math.abs(p.y - PAINT.y2);
  if (dPaintB < threshold) {
    candidates.push({
      point: { x: p.x, y: PAINT.y2 },
      dist: dPaintB,
      target: 'paint-bottom',
    });
  }
  // Ligne des LF (redondant avec paint-bottom si même y, mais sémantique
  // claire : nommer 'free-throw' quand l'utilisateur snape à 235 SANS être
  // forcément dans le rectangle raquette). On dédoublonne via distance :
  // si paint-bottom déjà ajouté ET FT à la même y, on ne double pas.
  if (FT_LINE_Y !== PAINT.y2) {
    const dFT = Math.abs(p.y - FT_LINE_Y);
    if (dFT < threshold) {
      candidates.push({
        point: { x: p.x, y: FT_LINE_Y },
        dist: dFT,
        target: 'free-throw',
      });
    }
  }

  // ----- Arc à 3 points -----
  // Distance au cercle de rayon THREE_POINT_RADIUS centré sur le panier.
  const dxHoop = p.x - hoop.x;
  const dyHoop = p.y - hoop.y;
  const radiusToHoop = Math.hypot(dxHoop, dyHoop);
  if (radiusToHoop > 1) {
    const distToArc = Math.abs(radiusToHoop - THREE_POINT_RADIUS);
    if (distToArc < threshold) {
      const k = THREE_POINT_RADIUS / radiusToHoop;
      candidates.push({
        point: { x: hoop.x + dxHoop * k, y: hoop.y + dyHoop * k },
        dist: distToArc,
        target: 'three-point-arc',
      });
    }
  }

  if (candidates.length === 0) {
    return { point: p, snappedTo: null };
  }

  // Le plus proche gagne. Tie : ordre d'insertion (stable).
  candidates.sort((a, b) => a.dist - b.dist);
  const best = candidates[0];
  return { point: best.point, snappedTo: best.target };
}
