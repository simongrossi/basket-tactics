import type {
  AttackerPositions,
  ComputedDefense,
  AttackerId,
  Point,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { computeAttackerThreats, shotZoneFor } from './threats';

/**
 * Phase B de la simulation : évaluation des options offensives depuis l'état
 * courant. Pour chaque action possible (tir direct, drive, passe + tir),
 * on calcule l'espérance de points (EV).
 *
 * Modèle déterministe — pas encore de Monte Carlo (Phase C).
 */

export type OffensiveActionType = 'shoot' | 'drive' | 'pass-shoot';

export interface OffensiveAction {
  type: OffensiveActionType;
  /** Pour 'pass-shoot' : id du receveur */
  targetId?: AttackerId;
  /** Espérance de points (0 à 3) — produit de toutes les probas × valeur du tir */
  expectedPoints: number;
  /** Probabilité que l'action aboutisse (1 pour shoot, ~0.7 pour drive, receivability pour pass) */
  successRate: number;
  /** Probabilité de marquer si l'action aboutit (FG% du tir final) */
  scoreProbability: number;
  /** Valeur du tir final (2 ou 3 points) */
  shotPoints: 2 | 3;
  /** Position du tir final pour visualisation (drive : projetée vers panier) */
  shotPos: Point;
  /** Label pour affichage compact */
  label: string;
}

/** Pénalité de drive : un drive est freiné par les défenseurs qui collapsent.
 *  On modélise en réduisant la qualité du tir post-drive de 30%. */
const DRIVE_QUALITY_PENALTY = 0.7;

/** Distance projetée d'un drive (px). Au-delà, on considère qu'on est au rim. */
const DRIVE_DISTANCE = 80;

/** Probabilité qu'un drive aboutisse (pas turnover, pas charge). */
const DRIVE_SUCCESS_RATE = 0.75;

/** Distance minimale du panier pour qu'un drive ait un sens (sinon on shoote). */
const DRIVE_MIN_DIST = 60;

const FG_BY_ZONE: Record<ReturnType<typeof shotZoneFor>, number> = {
  rim: 0.65,
  paint: 0.50,
  mid: 0.40,
  three: 0.36,
  deep: 0.28,
};

function shotPointsFor(zone: ReturnType<typeof shotZoneFor>): 2 | 3 {
  return zone === 'three' || zone === 'deep' ? 3 : 2;
}

function contestMultiplier(distToNearestDef: number): number {
  return 0.5 + 0.5 * Math.min(1, distToNearestDef / 80);
}

function nearestDefenderDistance(pos: Point, defPos: ComputedDefense): number {
  let min = Infinity;
  Object.values(defPos).forEach((d) => {
    const dd = distance({ x: d.x, y: d.y }, pos);
    if (dd < min) min = dd;
  });
  return min;
}

export function evaluateOffensiveOptions(
  off: AttackerPositions,
  defPos: ComputedDefense,
  carrier: AttackerId,
  hoop: Point = HOOP
): OffensiveAction[] {
  const actions: OffensiveAction[] = [];
  const carrierPos = off[carrier];
  const carrierDist = distance(carrierPos, hoop);
  const carrierZone = shotZoneFor(carrierDist);

  // === Option 1 : Tir direct ===
  const carrierContest = nearestDefenderDistance(carrierPos, defPos);
  const carrierShotQ = FG_BY_ZONE[carrierZone] * contestMultiplier(carrierContest);
  const carrierShotPts = shotPointsFor(carrierZone);
  actions.push({
    type: 'shoot',
    expectedPoints: carrierShotQ * carrierShotPts,
    successRate: 1,
    scoreProbability: carrierShotQ,
    shotPoints: carrierShotPts,
    shotPos: carrierPos,
    label: 'Tir',
  });

  // === Option 2 : Drive (avancer vers le panier puis tirer) ===
  if (carrierDist > DRIVE_MIN_DIST) {
    const driveDist = Math.min(DRIVE_DISTANCE, carrierDist - 30);
    const dx = (hoop.x - carrierPos.x) / carrierDist;
    const dy = (hoop.y - carrierPos.y) / carrierDist;
    const drivePos = {
      x: carrierPos.x + dx * driveDist,
      y: carrierPos.y + dy * driveDist,
    };
    const driveZone = shotZoneFor(distance(drivePos, hoop));
    const driveContest = nearestDefenderDistance(drivePos, defPos);
    const driveShotQ =
      FG_BY_ZONE[driveZone] * contestMultiplier(driveContest) * DRIVE_QUALITY_PENALTY;
    const drivePts = shotPointsFor(driveZone);
    actions.push({
      type: 'drive',
      expectedPoints: DRIVE_SUCCESS_RATE * driveShotQ * drivePts,
      successRate: DRIVE_SUCCESS_RATE,
      scoreProbability: driveShotQ,
      shotPoints: drivePts,
      shotPos: drivePos,
      label: 'Drive',
    });
  }

  // === Option 3 : Passe vers chaque coéquipier puis tir ===
  const threats = computeAttackerThreats(off, defPos, carrier, hoop);
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    if (oId === carrier) return;
    const t = threats[oId];
    const recPos = off[oId];
    const recZone = shotZoneFor(distance(recPos, hoop));
    const recPts = shotPointsFor(recZone);
    const ev = t.receivability * t.shotQuality * recPts;
    actions.push({
      type: 'pass-shoot',
      targetId: oId,
      expectedPoints: ev,
      successRate: t.receivability,
      scoreProbability: t.shotQuality,
      shotPoints: recPts,
      shotPos: recPos,
      label: `Passe → ${oId}`,
    });
  });

  return actions.sort((a, b) => b.expectedPoints - a.expectedPoints);
}

export function bestOffensiveAction(actions: OffensiveAction[]): OffensiveAction | null {
  return actions[0] || null;
}
