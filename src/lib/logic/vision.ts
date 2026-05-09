import type { OffBallStance, Point } from '../types';

export type GazeLock = 'opponent' | 'ball-carrier' | 'both';

export const HEAD_TURN_LIMIT_DEG = 60;
export const FIELD_OF_VIEW_HALF_ANGLE_DEG = 60;

interface Interval {
  min: number;
  max: number;
}

export interface DefenderGazeInput {
  defenderPos: Point;
  manPos: Point;
  ballPos: Point;
  bodyOrientation: number;
  isCarrierDefender?: boolean;
  stance?: OffBallStance;
  pnrRole?: 'tag' | 'x-out' | 'stunt';
  gazeLock?: GazeLock;
}

/**
 * Clamp anatomique : la tête ne peut pas viser au-delà du cône frontal du
 * corps. Le cône rendu dans FieldOfViewOverlay partage cette même demi-angle.
 */
export function clampGazeToFrontal(gaze: number, body: number): number {
  const diff = angleDiff(gaze, body);
  if (diff > HEAD_TURN_LIMIT_DEG) return normalizeAngle(body + HEAD_TURN_LIMIT_DEG);
  if (diff < -HEAD_TURN_LIMIT_DEG) return normalizeAngle(body - HEAD_TURN_LIMIT_DEG);
  return normalizeAngle(gaze);
}

export function resolveDefenderGaze(input: DefenderGazeInput): number {
  const { defenderPos, manPos, ballPos, bodyOrientation, isCarrierDefender, stance, pnrRole, gazeLock } = input;

  if (gazeLock === 'opponent') {
    return resolvePrimaryGaze(defenderPos, bodyOrientation, manPos, ballPos);
  }
  if (gazeLock === 'ball-carrier') {
    return resolvePrimaryGaze(defenderPos, bodyOrientation, ballPos, manPos);
  }
  if (gazeLock === 'both') {
    return resolveSharedGaze(defenderPos, bodyOrientation, manPos, ballPos);
  }
  if (isCarrierDefender) {
    return resolvePrimaryGaze(defenderPos, bodyOrientation, manPos);
  }
  if (pnrRole === 'tag' || pnrRole === 'x-out' || pnrRole === 'stunt') {
    return resolvePrimaryGaze(defenderPos, bodyOrientation, ballPos, manPos);
  }
  if (stance === 'fronting' || stance === 'deny-3q' || stance === 'stunt') {
    return resolvePrimaryGaze(defenderPos, bodyOrientation, ballPos, manPos);
  }

  // Sag / behind / défaut : priorité au ballon, mais on garde l'homme marqué
  // dans le cône de vision si la géométrie humaine le permet.
  return resolvePrimaryGaze(defenderPos, bodyOrientation, ballPos, manPos);
}

function resolvePrimaryGaze(from: Point, body: number, primary: Point, secondary?: Point): number {
  const allowed: Interval = { min: -HEAD_TURN_LIMIT_DEG, max: HEAD_TURN_LIMIT_DEG };
  const primaryRel = angleDiff(angleFromNorth(from, primary), body);

  if (!secondary) {
    return normalizeAngle(body + clamp(primaryRel, allowed.min, allowed.max));
  }

  const secondaryRel = angleDiff(angleFromNorth(from, secondary), body);
  const bothVisible = intersectIntervals(
    allowed,
    visibleFromGazeInterval(primaryRel),
    visibleFromGazeInterval(secondaryRel)
  );

  // Si les deux cibles peuvent humainement entrer dans le cône, on garde la
  // cible principale aussi centrée que possible tout en laissant la secondaire
  // au moins en vision périphérique. Sinon, priorité à la consigne principale.
  const gazeRel = bothVisible
    ? clamp(primaryRel, bothVisible.min, bothVisible.max)
    : clamp(primaryRel, allowed.min, allowed.max);
  return normalizeAngle(body + gazeRel);
}

function resolveSharedGaze(from: Point, body: number, a: Point, b: Point): number {
  const allowed: Interval = { min: -HEAD_TURN_LIMIT_DEG, max: HEAD_TURN_LIMIT_DEG };
  const aRel = angleDiff(angleFromNorth(from, a), body);
  const bRel = angleDiff(angleFromNorth(from, b), body);
  const preferredRel = circularMeanRelative(aRel, bRel);
  const bothVisible = intersectIntervals(
    allowed,
    visibleFromGazeInterval(aRel),
    visibleFromGazeInterval(bRel)
  );

  if (bothVisible) {
    return normalizeAngle(body + clamp(preferredRel, bothVisible.min, bothVisible.max));
  }

  const candidates = [
    allowed.min,
    allowed.max,
    clamp(preferredRel, allowed.min, allowed.max),
    clamp(aRel, allowed.min, allowed.max),
    clamp(bRel, allowed.min, allowed.max),
  ];
  const bestRel = candidates.reduce((best, cur) => {
    const bestScore = sharedGazeScore(best, aRel, bRel, preferredRel);
    const curScore = sharedGazeScore(cur, aRel, bRel, preferredRel);
    return curScore < bestScore ? cur : best;
  }, candidates[0]);
  return normalizeAngle(body + bestRel);
}

function visibleFromGazeInterval(targetRel: number): Interval {
  return {
    min: targetRel - FIELD_OF_VIEW_HALF_ANGLE_DEG,
    max: targetRel + FIELD_OF_VIEW_HALF_ANGLE_DEG,
  };
}

function intersectIntervals(...intervals: Interval[]): Interval | null {
  const min = Math.max(...intervals.map((i) => i.min));
  const max = Math.min(...intervals.map((i) => i.max));
  return min <= max ? { min, max } : null;
}

function sharedGazeScore(gazeRel: number, aRel: number, bRel: number, preferredRel: number): number {
  const worstTargetDistance = Math.max(
    Math.abs(angleDiff(aRel, gazeRel)),
    Math.abs(angleDiff(bRel, gazeRel))
  );
  return worstTargetDistance * 1000 + Math.abs(angleDiff(gazeRel, preferredRel));
}

function circularMeanRelative(aRel: number, bRel: number): number {
  const a = (aRel * Math.PI) / 180;
  const b = (bRel * Math.PI) / 180;
  const x = Math.sin(a) + Math.sin(b);
  const y = Math.cos(a) + Math.cos(b);
  if (Math.hypot(x, y) < 0.0001) return 0;
  return (Math.atan2(x, y) * 180) / Math.PI;
}

function angleFromNorth(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  return ((a - b) % 360 + 540) % 360 - 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
