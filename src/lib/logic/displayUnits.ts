import { PX_PER_M } from '../data/court';
import { DEFAULT_SECONDS_PER_STEP } from './timecode';

export function formatDistance(px: number): string {
  return `${(px / PX_PER_M).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}
/** Legacy movement setting is a distance per standard transition, not px/s. */
export function movementBudgetToMps(px: number): number {
  return px / PX_PER_M / DEFAULT_SECONDS_PER_STEP;
}
export function mpsToMovementBudget(mps: number): number {
  return mps * PX_PER_M * DEFAULT_SECONDS_PER_STEP;
}
