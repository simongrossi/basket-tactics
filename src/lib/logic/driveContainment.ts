// Cœur pur de containment du drive (approche A — course au point de contain).
//
// Agnostique du contexte : ni playback ni match-sim. Consommé par
// `defense/driveContainmentLayer.ts` (playback) et la règle coach
// `coachDiagnostics/rules/driveContainment.ts`, et plus tard par le
// match-sim (2b). Déterministe, sans mutation.

import type { Point } from '../types';
import { distance } from './geometry';

/** Gain minimal de distance vers le panier (entre N-1 et N) pour qu'on
 *  considère le porteur en drive. Calibrable. */
export const DRIVE_MIN_GAIN_PX = 15;

/** Demi-fenêtre de marge d'ETA (en « steps ») séparant contained des cas
 *  tranchés walled/beaten. Calibrable. */
export const CONTAIN_MARGIN_STEPS = 0.15;

export type ContainmentLevel = 'beaten' | 'contained' | 'walled';
export type SpeedTier = 'elite' | 'standard' | 'lent';

export interface DriveContainmentResult {
  isDriving: boolean;
  containPoint: Point;
  level: ContainmentLevel;
  /** ETA_def − ETA_porteur jusqu'au containPoint (steps). Négatif = def avant. */
  margin: number;
}

export interface DriveContainmentInput {
  carrier: Point;
  carrierPrev: Point | null;
  defender: Point;
  hoop: Point;
  carrierSpeed: number;
  defenderSpeed: number;
}

/** Tier athlétique → vitesse effective (mêmes multiplicateurs que
 *  `defenderSpeedProfiles` : elite ×1.3, lent ×0.7, sinon ×1.0). */
export function containmentSpeed(tier: SpeedTier | undefined, base: number): number {
  const mult = tier === 'elite' ? 1.3 : tier === 'lent' ? 0.7 : 1.0;
  return base * mult;
}

/** Point du segment [a,b] le plus proche de p (paramètre clampé [0,1]). */
function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom < 1e-9) return { x: a.x, y: a.y };
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + abx * tc, y: a.y + aby * tc };
}

function eta(from: Point, to: Point, speed: number): number {
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  return distance(from, to) / speed;
}

export function evaluateDriveContainment(
  input: DriveContainmentInput,
): DriveContainmentResult {
  const { carrier, carrierPrev, defender, hoop, carrierSpeed, defenderSpeed } = input;

  // Détection drive : gain de distance vers le panier sur le dernier pas.
  const gain = carrierPrev ? distance(carrierPrev, hoop) - distance(carrier, hoop) : 0;
  const isDriving = carrierPrev !== null && gain > DRIVE_MIN_GAIN_PX;

  // containPoint = projection du défenseur sur le segment porteur→panier,
  // clampée entre porteur (t=0) et panier (t=1) → toujours devant le porteur.
  const containPoint = closestPointOnSegment(defender, carrier, hoop);

  if (!isDriving) {
    return { isDriving: false, containPoint, level: 'beaten', margin: Number.POSITIVE_INFINITY };
  }

  const etaCarrier = eta(carrier, containPoint, carrierSpeed);
  const etaDef = eta(defender, containPoint, defenderSpeed);
  // `etaDef === etaCarrier` couvre le cas deux ETA infinies (vitesses ≤ 0)
  // qui produirait sinon `Infinity − Infinity = NaN`. Une seule ETA infinie
  // donne ±Infinity (jamais NaN), un verdict cohérent.
  const margin = etaDef === etaCarrier ? 0 : etaDef - etaCarrier;

  let level: ContainmentLevel;
  if (margin < -CONTAIN_MARGIN_STEPS) level = 'walled';
  else if (margin > CONTAIN_MARGIN_STEPS) level = 'beaten';
  else level = 'contained';

  return { isDriving, containPoint, level, margin };
}
