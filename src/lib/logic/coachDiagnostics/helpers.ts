// Helpers de formatage + géométrie partagés par les règles de diagnostic.
//
// Toutes purs, pas d'imports métier au-delà du Point.

import type { AttackerId, OffensiveProfile, Point } from '../../types';

/** Étiquette courte du profil pour insérer dans les phrases coach. */
export function profileTag(profile?: OffensiveProfile): string {
  switch (profile) {
    case 'shooter':     return 'tireur';
    case 'stretch-big': return 'stretch big';
    case 'slasher':     return 'slasher';
    case 'rim-roller':  return 'rim-roller';
    case 'creator':     return 'créateur';
    case 'non-shooter': return 'non-shooter';
    default:            return '';
  }
}

/** Marque un attaquant avec son profil entre parenthèses si défini. */
export function withProfile(oId: AttackerId, profile?: OffensiveProfile): string {
  const tag = profileTag(profile);
  return tag ? `${oId} (${tag})` : oId;
}

/** Vrai si l'attaquant est un menace 3pts (shooter ou stretch-big). */
export function isOutsideThreat(profile?: OffensiveProfile): boolean {
  return profile === 'shooter' || profile === 'stretch-big';
}

/**
 * Côté terrain (-1 gauche, 0 centre, 1 droite) pour un point, basé sur la
 * coordonnée x du panier. Sert pour détecter "côté faible" / "côté ballon".
 */
export function sideOf(p: Point, hoop: Point): -1 | 0 | 1 {
  const dx = p.x - hoop.x;
  if (Math.abs(dx) < 30) return 0;
  return dx > 0 ? 1 : -1;
}

/** Vrai si l'attaquant est dans un coin baseline (proche sideline + proche
 *  fond). Coin = à <100px du fond verticalement ET à >180px latéralement. */
export function isCornerAttacker(pos: Point, hoop: Point): boolean {
  const distFromHoopY = Math.abs(pos.y - hoop.y);
  const distFromHoopX = Math.abs(pos.x - hoop.x);
  return distFromHoopY < 100 && distFromHoopX > 180;
}
