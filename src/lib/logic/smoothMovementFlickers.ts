import type { AttackerId, Point, Step } from '@/lib/types';
import {
  FLICKER_COS_THRESHOLD,
  FLICKER_MIN_VELOCITY_PX,
} from './anomaly/anomalyDetector';

const ATTACKER_IDS: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

export interface SmoothMovementFlickersOptions {
  minVelocityPx?: number;
  cosThreshold?: number;
  maxPasses?: number;
  players?: AttackerId[];
}

/**
 * Inserts hidden hold steps at offensive pivot points that would otherwise read
 * as A -> B -> A flicker. The inserted step keeps the player at the pivot for
 * one generated segment, so the velocity drops to zero before the reversal.
 */
export function smoothMovementFlickers(
  steps: Step[],
  options: SmoothMovementFlickersOptions = {},
): Step[] {
  if (steps.length < 3) return steps;

  const minVelocityPx = options.minVelocityPx ?? FLICKER_MIN_VELOCITY_PX;
  const cosThreshold = options.cosThreshold ?? FLICKER_COS_THRESHOLD;
  const maxPasses = options.maxPasses ?? 4;
  const players = options.players ?? ATTACKER_IDS;

  let current = steps;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const next = insertDwellPass(current, players, minVelocityPx, cosThreshold);
    if (next.length === current.length) return current;
    current = next;
  }

  return current;
}

function insertDwellPass(
  steps: Step[],
  players: AttackerId[],
  minVelocityPx: number,
  cosThreshold: number,
): Step[] {
  const insertBefore = new Set<number>();

  for (let i = 2; i < steps.length; i += 1) {
    if (hasOffensiveFlicker(
      steps[i - 2],
      steps[i - 1],
      steps[i],
      players,
      minVelocityPx,
      cosThreshold,
    )) {
      insertBefore.add(i);
    }
  }

  if (insertBefore.size === 0) return steps;

  const out: Step[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    if (insertBefore.has(i)) {
      out.push(makeHiddenDwellStep(steps[i - 1], steps[i]));
    }
    out.push(steps[i]);
  }
  return out;
}

function hasOffensiveFlicker(
  a: Step,
  b: Step,
  c: Step,
  players: AttackerId[],
  minVelocityPx: number,
  cosThreshold: number,
): boolean {
  return players.some((id) =>
    isOpposedTurn(a.off[id], b.off[id], c.off[id], minVelocityPx, cosThreshold),
  );
}

function isOpposedTurn(
  a: Point | undefined,
  b: Point | undefined,
  c: Point | undefined,
  minVelocityPx: number,
  cosThreshold: number,
): boolean {
  if (!a || !b || !c) return false;

  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < minVelocityPx || m2 < minVelocityPx) return false;

  const cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
  return cos <= cosThreshold;
}

function makeHiddenDwellStep(pivot: Step, next: Step): Step {
  const dwell: Step = {
    off: structuredClone(pivot.off),
    ballCarrier: pivot.ballCarrier,
    annotations: [],
    label: pivot.label ? `${pivot.label} - tenue` : 'Tenue anti-flicker',
    isInterpolated: true,
  };

  if (pivot.generatedBy ?? next.generatedBy) {
    dwell.generatedBy = pivot.generatedBy ?? next.generatedBy;
  }
  if (pivot.switches) dwell.switches = structuredClone(pivot.switches);
  if (pivot.defenseOverrides) dwell.defenseOverrides = structuredClone(pivot.defenseOverrides);
  if (pivot.forcedScreener) dwell.forcedScreener = pivot.forcedScreener;
  if (pivot.defensiveDirectives) dwell.defensiveDirectives = structuredClone(pivot.defensiveDirectives);
  if (pivot.assignmentOverrides) dwell.assignmentOverrides = structuredClone(pivot.assignmentOverrides);
  if (pivot.clockSeconds !== undefined) dwell.clockSeconds = pivot.clockSeconds;
  if (pivot.shotClockRemaining !== undefined) dwell.shotClockRemaining = pivot.shotClockRemaining;
  if (pivot.sprintBoost !== undefined) dwell.sprintBoost = pivot.sprintBoost;
  if (pivot.viewSide) dwell.viewSide = pivot.viewSide;
  if (pivot.context) dwell.context = pivot.context;

  return dwell;
}
