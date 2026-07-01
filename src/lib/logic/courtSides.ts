import type { Point } from '../types';
import { CARRIER_SIDE_TOLERANCE_PX, HOOP } from '../data/court';

/**
 * Utilitaire partagé « côté du terrain » (ball-side / weak-side /
 * strong-side). Avant ce module, la logique était dupliquée sur 3 chemins
 * (`geometry.ballSide`, `zoneSituations.attackerSide`, signes inlinés dans
 * `help.ts` / `zoneDefense.ts` / `manDefense.ts`) avec des sémantiques
 * subtilement divergentes. Les deux sémantiques historiques sont conservées
 * telles quelles — les unifier changerait le comportement (hors scope P0.1) :
 *
 * - **avec bande centrale** (`sideWithTolerance`) : un joueur à moins de
 *   `tolerancePx` de l'axe est « central » (0). Utilisée pour le ballon et
 *   les attaquants (détection overload, skip pass, ancre weak-side).
 * - **stricte** (`strictSide`) : signe pur, pas de bande centrale. Utilisée
 *   par l'aide man (`help.ts`) et le moteur zone.
 *
 * L'axe de référence est vertical : `HOOP.x` (= 300, identique pour les deux
 * paniers) ou le centre du demi-terrain — même valeur, deux vocabulaires.
 */

/** -1 = côté gauche, 0 = central (bande morte éventuelle), 1 = côté droit. */
export type CourtSide = -1 | 0 | 1;

/** Côté par rapport à l'axe `refX` avec bande centrale de ±`tolerancePx`. */
export function sideWithTolerance(
  x: number,
  refX: number = HOOP.x,
  tolerancePx: number = CARRIER_SIDE_TOLERANCE_PX
): CourtSide {
  const dx = x - refX;
  if (Math.abs(dx) < tolerancePx) return 0;
  return dx > 0 ? 1 : -1;
}

/** Côté strict (sans bande centrale) : signe pur de `x - refX`. */
export function strictSide(x: number, refX: number = HOOP.x): CourtSide {
  if (x > refX) return 1;
  if (x < refX) return -1;
  return 0;
}

/** Côté binaire (jamais 0, l'axe compte comme droite). Pour les offsets
 *  latéraux signés (stance topside/baseline) où « central » n'a pas de sens. */
export function binarySide(x: number, refX: number = HOOP.x): -1 | 1 {
  return x >= refX ? 1 : -1;
}

/** Côté du ballon avec bande centrale. `undefined` (pas de porteur) → 0. */
export function ballSide(carrierPos: Point | undefined): CourtSide {
  if (!carrierPos) return 0;
  return sideWithTolerance(carrierPos.x, HOOP.x, CARRIER_SIDE_TOLERANCE_PX);
}

/** Un attaquant est « côté G » si x < hoop.x - CARRIER_SIDE_TOLERANCE_PX,
 *  « côté D » si x > hoop.x + tolerance, « central » sinon. */
export function attackerSide(pos: Point, hoop: Point = HOOP): CourtSide {
  return sideWithTolerance(pos.x, hoop.x, CARRIER_SIDE_TOLERANCE_PX);
}

/** Weak-side : les deux côtés sont définis (≠ 0) et opposés. */
export function isWeakSide(side: CourtSide, ballSideValue: CourtSide): boolean {
  return side !== 0 && ballSideValue !== 0 && side !== ballSideValue;
}

/** Strong-side : les deux côtés sont définis (≠ 0) et identiques. */
export function isStrongSide(side: CourtSide, ballSideValue: CourtSide): boolean {
  return side !== 0 && ballSideValue !== 0 && side === ballSideValue;
}
