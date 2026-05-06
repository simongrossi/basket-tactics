import type {
  AttackerPositions,
  ComputedDefense,
  AttackerId,
  DefenderId,
  Point,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';

export interface DefensiveMetrics {
  /** Nombre de défenseurs à moins de 100px du panier (proxy : "dans la raquette ou très proche"). */
  paintCoverage: number;
  /** Pour chaque attaquant, distance au défenseur le plus proche. On retient le MAX (= attaquant le plus libre). */
  maxGap: number;
  /** ID de l'attaquant le plus libre. */
  mostFreeAttacker: AttackerId | null;
  /** Écart moyen entre chaque défenseur et son attaquant matché. */
  avgDefenseDist: number;
  /** Nombre de défenseurs en retard (`late: true`). */
  lateCount: number;
  /** Somme des `helpFactor` (intensité d'aide globale). */
  helpFactorTotal: number;
  /** Nombre de lignes de passe ouvertes / contestées / bloquées depuis le porteur. */
  openPasses: number;
  contestedPasses: number;
  blockedPasses: number;
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function computeMetrics(
  off: AttackerPositions,
  defPos: ComputedDefense,
  carrier: AttackerId,
  hoop: Point = HOOP
): DefensiveMetrics {
  let paintCoverage = 0;
  let lateCount = 0;
  let helpTotal = 0;
  let totalDist = 0;
  let countMatched = 0;

  (Object.keys(defPos) as DefenderId[]).forEach((dId) => {
    const d = defPos[dId];
    if (distance({ x: d.x, y: d.y }, hoop) < 100) paintCoverage++;
    if (d.late) lateCount++;
    helpTotal += d.helpFactor || 0;
    const matched = off[d.matchedTo];
    if (matched) {
      totalDist += distance({ x: d.x, y: d.y }, matched);
      countMatched++;
    }
  });

  // Plus grand écart attaquant ↔ défenseur le plus proche
  let maxGap = 0;
  let mostFreeAttacker: AttackerId | null = null;
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    const a = off[oId];
    let minD = Infinity;
    (Object.keys(defPos) as DefenderId[]).forEach((dId) => {
      const dp = defPos[dId];
      const dd = distance({ x: dp.x, y: dp.y }, a);
      if (dd < minD) minD = dd;
    });
    if (minD < Infinity && minD > maxGap) {
      maxGap = minD;
      mostFreeAttacker = oId;
    }
  });

  // Lignes de passe : depuis le porteur vers chaque autre attaquant
  const carrierPos = off[carrier];
  let openPasses = 0;
  let contestedPasses = 0;
  let blockedPasses = 0;
  if (carrierPos) {
    (Object.keys(off) as AttackerId[]).forEach((oId) => {
      if (oId === carrier) return;
      const target = off[oId];
      let minClearance = Infinity;
      (Object.keys(defPos) as DefenderId[]).forEach((dId) => {
        const d = defPos[dId];
        const dd = distancePointToSegment({ x: d.x, y: d.y }, carrierPos, target);
        if (dd < minClearance) minClearance = dd;
      });
      if (minClearance < 18) blockedPasses++;
      else if (minClearance < 35) contestedPasses++;
      else openPasses++;
    });
  }

  return {
    paintCoverage,
    maxGap: Math.round(maxGap),
    mostFreeAttacker,
    avgDefenseDist: countMatched > 0 ? Math.round(totalDist / countMatched) : 0,
    lateCount,
    helpFactorTotal: Math.round(helpTotal * 100) / 100,
    openPasses,
    contestedPasses,
    blockedPasses,
  };
}
