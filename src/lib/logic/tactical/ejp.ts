import type { Point } from '../../types';
import { normalizeAngle } from '../angles';

export type EJPSector =
  | 'front'
  | 'frontRight'
  | 'right'
  | 'backRight'
  | 'back'
  | 'backLeft'
  | 'left'
  | 'frontLeft';

export interface EJPRead {
  distance: number;
  sector: EJPSector;
  bearingDeg: number;
}

const SECTORS: EJPSector[] = [
  'front',
  'frontRight',
  'right',
  'backRight',
  'back',
  'backLeft',
  'left',
  'frontLeft',
];

function sectorOf(bearingDeg: number): EJPSector {
  const shifted = normalizeAngle(bearingDeg + 22.5);
  const idx = Math.floor(shifted / 45) % 8;
  return SECTORS[idx];
}

export function readEJP(
  carrier: Point,
  carrierBodyDeg: number,
  defender: Point,
): EJPRead {
  const vx = defender.x - carrier.x;
  const vy = defender.y - carrier.y;
  const distance = Math.hypot(vx, vy);
  // World bearing in project convention: 0° = north, 90° = east, clockwise.
  // SVG y is down, so north is (0, -1) → atan2(vx, -vy) gives the right angle.
  const worldDeg = (Math.atan2(vx, -vy) * 180) / Math.PI;
  const bearingDeg = normalizeAngle(worldDeg - carrierBodyDeg);
  return { distance, sector: sectorOf(bearingDeg), bearingDeg };
}
