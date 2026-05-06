import type { Point, CarrierBehavior, OffBallStance } from '../types';
import { HOOP, THREE_POINT_RADIUS, PLAYER_RADIUS } from '../data/court';
import { clamp } from './geometry';

/**
 * Position cible d'un défenseur en marquage classique :
 * sur la ligne homme-panier, à `distance` pixels devant son homme.
 */
export function manTarget(att: Point | undefined, distance: number): Point | null {
  if (!att) return null;
  const dx = att.x - HOOP.x;
  const dy = att.y - HOOP.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ratio = Math.max(0, (dist - distance) / dist);
  return { x: HOOP.x + dx * ratio, y: HOOP.y + dy * ratio };
}

export function carrierDefenderTarget(
  vsCarrier: CarrierBehavior,
  att: Point | undefined,
  defenseDistance: number
): Point | null {
  if (!att) return null;
  const dx = att.x - HOOP.x;
  const dy = att.y - HOOP.y;
  const dist = Math.hypot(dx, dy) || 1;

  const normalizedDist = clamp(dist / THREE_POINT_RADIUS, 0, 1.5);
  const pressureFactor = 1 + (1 - normalizedDist) * 0.8;

  let baseRatio: number;
  let bumpOffset = 0;

  let lateralOffset = 0;
  switch (vsCarrier) {
    case 'coller':
      baseRatio = 0.4;
      break;
    case 'bumper':
      baseRatio = 0.25;
      bumpOffset = 8;
      break;
    case 'contester':
      baseRatio = 0.7;
      break;
    case 'reculer':
      baseRatio = 1.3;
      break;
    case 'topside':
      baseRatio = 0.4;
      lateralOffset = 14; // pousse vers le côté ligne de fond → milieu
      break;
    case 'baseline':
      baseRatio = 0.4;
      lateralOffset = -14; // force le porteur côté ligne de fond
      break;
  }

  // Distance minimale pour que les cercles ne se superposent pas visuellement.
  const MIN_TARGET_DIST = PLAYER_RADIUS * 2 + 2;
  const targetDist = Math.max(MIN_TARGET_DIST, (baseRatio * defenseDistance) / pressureFactor);

  const ratio = Math.max(0, (dist - targetDist) / dist);
  // Décalage latéral : perpendiculaire à l'axe homme-panier, signé
  // selon le côté du porteur (+ vers le centre du terrain en haut/bas)
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const sideSign = att.x >= HOOP.x ? 1 : -1;
  return {
    x: HOOP.x + dx * ratio - (dx / dist) * bumpOffset + perpX * lateralOffset * sideSign,
    y: HOOP.y + dy * ratio - (dy / dist) * bumpOffset + perpY * lateralOffset * sideSign,
  };
}

/**
 * Position cible d'un défenseur HORS-BALLON selon sa stance off-ball.
 * - 'sag' / undefined : entre attaquant et panier (manTarget classique)
 * - 'behind' : strictement entre attaquant et panier, sans biais d'aide
 * - 'deny-3q' : 3/4 ball-side — un pied dans la ligne de passe
 * - 'fronting' : entre attaquant et ballon (full denial / face-guard)
 */
export function offBallStanceTarget(
  att: Point | undefined,
  ball: Point | undefined,
  defenseDistance: number,
  stance: OffBallStance
): Point | null {
  if (!att) return null;
  if (!ball || stance === 'sag' || stance === 'behind') {
    return manTarget(att, defenseDistance);
  }

  // Position "behind" (entre attaquant et panier)
  const dxB = HOOP.x - att.x;
  const dyB = HOOP.y - att.y;
  const dB = Math.hypot(dxB, dyB) || 1;
  const behind = {
    x: att.x + (dxB / dB) * defenseDistance,
    y: att.y + (dyB / dB) * defenseDistance,
  };

  // Position "fronting" (entre attaquant et ballon)
  const dxF = ball.x - att.x;
  const dyF = ball.y - att.y;
  const dF = Math.hypot(dxF, dyF) || 1;
  const front = {
    x: att.x + (dxF / dF) * defenseDistance,
    y: att.y + (dyF / dF) * defenseDistance,
  };

  const blend = stance === 'fronting' ? 1 : 0.75; // deny-3q
  return {
    x: behind.x + (front.x - behind.x) * blend,
    y: behind.y + (front.y - behind.y) * blend,
  };
}
