// Phy.O V3 V2 — Choix de côté du cut (approche B du RFC).
//
// Si une annotation `cut` a `flipSideIfDefenderOn`, on évalue à la lecture de
// quel côté de l'axe from→to se trouve le défenseur matché. S'il est du côté
// trigger, le path est miroité par symétrie axiale autour de from→to — le cut
// part du côté opposé pour éviter le mur défensif.
//
// Pur. Les endpoints from/to sont sur l'axe → invariants par la réflexion ;
// on les RÉ-INJECTE explicitement pour zéro drift flottant.

import type { Point } from '../types';

/** Côté du point `p` par rapport à l'axe orienté from→to, via le signe du
 *  cross-product (to-from) × (p-from). >0 → 'left', <0 → 'right', 0 → 'on'.
 *  Convention cohérente tant qu'on l'utilise symétriquement (le flip est une
 *  réflexion, le côté absolu importe peu). */
export function defenderSide(from: Point, to: Point, p: Point): 'left' | 'right' | 'on' {
  const ax = to.x - from.x;
  const ay = to.y - from.y;
  const bx = p.x - from.x;
  const by = p.y - from.y;
  const cross = ax * by - ay * bx;
  if (cross > 1e-9) return 'left';
  if (cross < -1e-9) return 'right';
  return 'on';
}

/** Réfléchit `p` par symétrie axiale autour de la droite (from, to). */
export function reflectAcrossAxis(p: Point, from: Point, to: Point): Point {
  const ax = to.x - from.x;
  const ay = to.y - from.y;
  const len2 = ax * ax + ay * ay;
  if (len2 < 1e-12) return { x: p.x, y: p.y }; // axe dégénéré
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const t = (dx * ax + dy * ay) / len2;
  const projX = from.x + t * ax;
  const projY = from.y + t * ay;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}

/** Évalue la règle de flip et retourne le path (éventuellement miroité) + un
 *  flag `flipped` (à inclure dans la clé de cache du profil de vitesse). */
export function maybeFlipCutPath(
  path: Point[],
  from: Point,
  to: Point,
  flipSide: 'left' | 'right' | undefined,
  defPos: Point | undefined,
): { path: Point[]; flipped: boolean } {
  if (!flipSide || !defPos) return { path, flipped: false };
  if (defenderSide(from, to, defPos) !== flipSide) return { path, flipped: false };
  const reflected = path.map((p) => reflectAcrossAxis(p, from, to));
  reflected[0] = { ...from };
  reflected[reflected.length - 1] = { ...to };
  return { path: reflected, flipped: true };
}
