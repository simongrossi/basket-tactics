// Helpers d'angles partagés (degrés). Module unique pour éviter les
// duplications historiques entre orientation.ts et vision.ts.
//
// Convention : angles 0–360° depuis le NORD, sens horaire (0° = nord,
// 90° = est, 180° = sud, 270° = ouest).

/** Ramène un angle dans [0, 360). */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Plus court écart signé entre `a` et `b`, dans [-180, 180). */
export function angleDiff(a: number, b: number): number {
  return ((a - b) % 360 + 540) % 360 - 180;
}

/** Interpolation circulaire entre deux angles (chemin le plus court).
 *  Retourne `a + diff * t` brut — non re-normalisé — pour préserver
 *  l'historique d'usage en rendu SVG (rotate accepte n'importe quelle plage). */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  const diff = angleDiff(b, a);
  return a + diff * t;
}

/** Angle en degrés depuis le Nord (sens horaire, convention terrain). */
export function angleFromNorth(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/**
 * Pivote progressivement `current` vers `target` avec une limite de vitesse
 * angulaire `maxDeltaDeg` (chemin le plus court).
 * Préserve la continuité et évite les sauts instantanés de rotation.
 */
export function rotateTowardsAngle(current: number, target: number, maxDeltaDeg: number): number {
  const diff = angleDiff(target, current);
  if (Math.abs(diff) <= maxDeltaDeg) {
    return normalizeAngle(target);
  }
  return normalizeAngle(current + Math.sign(diff) * maxDeltaDeg);
}
