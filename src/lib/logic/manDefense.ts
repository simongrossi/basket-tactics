import type { Point, CarrierBehavior } from '../types';
import { HOOP, THREE_POINT_RADIUS } from '../data/court';
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
  }

  const targetDist = (baseRatio * defenseDistance) / pressureFactor;

  const ratio = Math.max(0, (dist - targetDist) / dist);
  return {
    x: HOOP.x + dx * ratio - (dx / dist) * bumpOffset,
    y: HOOP.y + dy * ratio - (dy / dist) * bumpOffset,
  };
}
