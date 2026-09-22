import type {
  AttackerPositions,
  ComputedDefense,
  AttackerId,
  Point,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { computeAttackerThreats, shotPointsAt, shotQualityAt } from './threats';
import {
  buildEJO,
  corridorBlockers,
  readEJP,
  EJO_CORRIDOR_WIDE_PX,
  type EJPSector,
} from './tactical';

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

export function nearestDefenderDistance(pos: Point, defPos: ComputedDefense): number {
  let min = Infinity;
  Object.values(defPos).forEach((d) => {
    const dd = distance({ x: d.x, y: d.y }, pos);
    if (dd < min) min = dd;
  });
  return min;
}

function nearestDefenderPos(pos: Point, defPos: ComputedDefense): Point | null {
  let min = Infinity;
  let best: Point | null = null;
  Object.values(defPos).forEach((d) => {
    const p = { x: d.x, y: d.y };
    const dd = distance(p, pos);
    if (dd < min) {
      min = dd;
      best = p;
    }
  });
  return best;
}

function defenderPositionsRecord(defPos: ComputedDefense): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const [id, d] of Object.entries(defPos)) {
    out[id] = { x: d.x, y: d.y };
  }
  return out;
}

/** Bearing world (0° = nord, horaire) du vecteur `from → to` en degrés. */
function bearingDegFromTo(from: Point, to: Point): number {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  return (Math.atan2(vx, -vy) * 180) / Math.PI;
}

// =============================================================
// Tuning EJO / EJP (branche A — enrichissement Mérand/Vandevelde)
// =============================================================

/** Pénalité par défenseur dans le couloir ballon→panier (large = 2.5 m). */
export const DRIVE_CORRIDOR_BLOCKER_PENALTY = 0.25;
/** Plancher de la pénalité de couloir saturé (ne va pas à 0 — un drive reste
 *  toujours faisable, même contre 3 hommes alignés). */
export const DRIVE_CORRIDOR_FLOOR = 0.25;

/** Facteur appliqué à la receivability d'une passe selon le secteur EJP du
 *  défenseur le plus proche du receveur, dans le référentiel du receveur
 *  (qui regarde le ballon). `front` = défenseur entre ballon et receveur =
 *  passe à risque ; `back` = défenseur trailing = ligne ouverte. */
export const PASS_EJP_FACTOR: Record<EJPSector, number> = {
  front: 0.75,
  frontLeft: 0.9,
  frontRight: 0.9,
  left: 1.0,
  right: 1.0,
  backLeft: 1.1,
  backRight: 1.1,
  back: 1.2,
};

export function evaluateOffensiveOptions(
  off: AttackerPositions,
  defPos: ComputedDefense,
  carrier: AttackerId,
  hoop: Point = HOOP,
  profiles?: import('../types').AttackerProfiles
): OffensiveAction[] {
  const actions: OffensiveAction[] = [];
  const carrierPos = off[carrier];
  const carrierDist = distance(carrierPos, hoop);

  // === Option 1 : Tir direct ===
  const carrierContest = nearestDefenderDistance(carrierPos, defPos);
  const carrierShotQ = shotQualityAt(carrierPos, carrierContest, hoop, profiles?.[carrier]);
  const carrierShotPts = shotPointsAt(carrierPos, hoop);
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
    const driveContest = nearestDefenderDistance(drivePos, defPos);
    // Couloir ballon→panier (EJO large, 2.5 m) — pénalité par défenseur dans
    // l'axe (Vandevelde : action de jeu direct contre couloir saturé).
    const ejo = buildEJO(carrierPos, hoop, EJO_CORRIDOR_WIDE_PX);
    const blockers = corridorBlockers(ejo, defenderPositionsRecord(defPos));
    const corridorOpenness = Math.max(
      DRIVE_CORRIDOR_FLOOR,
      1 - DRIVE_CORRIDOR_BLOCKER_PENALTY * blockers.length,
    );
    const driveShotQ =
      shotQualityAt(drivePos, driveContest, hoop, profiles?.[carrier]) *
      DRIVE_QUALITY_PENALTY *
      corridorOpenness;
    const drivePts = shotPointsAt(drivePos, hoop);
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
  const threats = computeAttackerThreats(off, defPos, carrier, hoop, profiles);
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    if (oId === carrier) return;
    const t = threats[oId];
    const recPos = off[oId];
    const recPts = shotPointsAt(recPos, hoop);
    // Lecture EJP : on suppose que le receveur fait face au ballon (il
    // s'attend à la passe). Un défenseur en `front` est entre le ballon et
    // le receveur — passe à risque ; `back` = trailing, ligne ouverte.
    const nearestDef = nearestDefenderPos(recPos, defPos);
    let ejpFactor = 1;
    if (nearestDef) {
      const receiverFacesBall = bearingDegFromTo(recPos, carrierPos);
      const ejp = readEJP(recPos, receiverFacesBall, nearestDef);
      ejpFactor = PASS_EJP_FACTOR[ejp.sector];
    }
    const adjustedReceivability = Math.min(1, t.receivability * ejpFactor);
    const ev = adjustedReceivability * t.shotQuality * recPts;
    actions.push({
      type: 'pass-shoot',
      targetId: oId,
      expectedPoints: ev,
      successRate: adjustedReceivability,
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
