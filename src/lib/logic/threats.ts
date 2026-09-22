import type {
  AttackerPositions,
  ComputedDefense,
  AttackerId,
  DefenderId,
  Point,
  AttackerProfiles,
  OffensiveProfile,
} from '../types';
import { HOOP, MIDLINE_Y, THREE_POINT_RADIUS, CORNER_3PT_X_LEFT } from '../data/court';
import { distance } from './geometry';

/**
 * Multiplicateur de qualité de tir selon le profil offensif et la zone.
 * Modélise les forces typées d'un joueur :
 *  - shooter / stretch-big tirent mieux à l'extérieur, moins bien au cercle ;
 *  - rim-roller / slasher inversement : finissent bien, tirent mal de loin ;
 *  - creator a un profil neutre, légèrement biaisé vers le mid (pull-up) ;
 *  - non-shooter pénalisé partout (mais moins en paint, où il finit encore).
 *
 * Bornes [0.55, 1.30] pour rester réaliste — pas de "100% à 3pts" sur shooter.
 */
function profileShotMultiplier(
  profile: OffensiveProfile | undefined,
  zone: ShotZone
): number {
  if (!profile) return 1;
  switch (profile) {
    case 'shooter':
      return zone === 'three' || zone === 'mid' ? 1.20 : zone === 'rim' ? 0.90 : 0.95;
    case 'stretch-big':
      return zone === 'three' ? 1.15 : zone === 'mid' ? 1.05 : zone === 'rim' ? 0.95 : 1.0;
    case 'slasher':
      return zone === 'rim' || zone === 'paint' ? 1.18 : zone === 'three' ? 0.85 : 1.0;
    case 'rim-roller':
      return zone === 'rim' ? 1.30 : zone === 'paint' ? 1.10 : zone === 'three' ? 0.65 : 0.85;
    case 'creator':
      return zone === 'mid' ? 1.05 : 1.0;
    case 'non-shooter':
      return zone === 'rim' ? 0.95 : zone === 'paint' ? 0.85 : 0.65;
    default:
      return 1;
  }
}

/**
 * Score de menace par attaquant — Phase A de la simulation.
 *
 * Modèle déterministe (pas de Monte Carlo) qui estime, sur l'état courant,
 * la probabilité que chaque attaquant marque s'il devient l'option offensive.
 *
 *     score = receivability × shotQuality
 *
 * - `shotQuality` : qualité du tir s'il tirait maintenant (FG% raw),
 *   modulé par la distance au défenseur le plus proche (contest)
 * - `receivability` : 1 si c'est le porteur, sinon dépend de la passe
 *   (ligne de passe ouverte / contestée / bloquée)
 */

export type ShotZone = 'rim' | 'paint' | 'mid' | 'three' | 'deep';

export interface AttackerThreat {
  attackerId: AttackerId;
  /** Score final 0..1 — probabilité de marquer si cet attaquant est l'option. */
  score: number;
  /** Qualité de tir brute 0..1 à sa position actuelle. */
  shotQuality: number;
  /** Probabilité que la balle l'atteigne 0..1 (1 si porteur). */
  receivability: number;
  /** Distance au défenseur le plus proche (contesteur potentiel). */
  contestDist: number;
  /** Zone de tir pour affichage. */
  zone: ShotZone;
  /** True si cet attaquant est le porteur (le score = shotQuality direct). */
  isCarrier: boolean;
}

/** FG% bruts par zone — ordres de grandeur NBA/FIBA pro. Volontairement
 *  conservateurs pour modéliser un tir contesté en moyenne. */
const SHOT_QUALITY_BY_ZONE: Record<ShotZone, number> = {
  rim: 0.65,
  paint: 0.50,
  mid: 0.40,
  three: 0.36,
  deep: 0.28,
};

export function shotZoneFor(distFromHoop: number): ShotZone {
  if (distFromHoop < 30) return 'rim';
  if (distFromHoop < 80) return 'paint';
  if (distFromHoop <= THREE_POINT_RADIUS) return 'mid';
  if (distFromHoop < 290) return 'three';
  return 'deep';
}

/** Géométrie commune au terrain FIBA : la ligne appartient à la zone à 2 points.
 * Les positions représentent le point d'appui du tireur, pas son rayon visuel. */
export function shotZoneAt(pos: Point, hoop: Point = HOOP): ShotZone {
  const dist = distance(pos, hoop);
  const cornerWidth = HOOP.x - CORNER_3PT_X_LEFT;
  const arcJoin = Math.sqrt(THREE_POINT_RADIUS ** 2 - cornerWidth ** 2);
  const towardMidcourt = (pos.y - hoop.y) * Math.sign(MIDLINE_Y - hoop.y);
  const three = towardMidcourt <= arcJoin
    ? Math.abs(pos.x - hoop.x) > cornerWidth
    : dist > THREE_POINT_RADIUS;
  if (three) return dist < 290 ? 'three' : 'deep';
  return dist < 30 ? 'rim' : dist < 80 ? 'paint' : 'mid';
}

export function shotPointsAt(pos: Point, hoop: Point = HOOP): 2 | 3 {
  const zone = shotZoneAt(pos, hoop);
  return zone === 'three' || zone === 'deep' ? 3 : 2;
}

/** Même qualité de tir pour le porteur, le receveur et une finition projetée. */
export function shotQualityAt(
  pos: Point, contestDistance: number, hoop: Point = HOOP, profile?: OffensiveProfile,
): number {
  const zone = shotZoneAt(pos, hoop);
  return SHOT_QUALITY_BY_ZONE[zone] * contestMultiplier(contestDistance) * profileShotMultiplier(profile, zone);
}

/** Pénalité de contest : au contact (0px) on divise la qualité par 2 ;
 *  à 80px+ aucune pénalité. Linéaire entre les deux. */
function contestMultiplier(distToNearestDef: number): number {
  return 0.5 + 0.5 * Math.min(1, distToNearestDef / 80);
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

export function computeAttackerThreats(
  off: AttackerPositions,
  defPos: ComputedDefense,
  carrier: AttackerId,
  hoop: Point = HOOP,
  profiles?: AttackerProfiles
): Record<AttackerId, AttackerThreat> {
  const result = {} as Record<AttackerId, AttackerThreat>;
  const carrierPos = off[carrier];

  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    const pos = off[oId];
    const zone = shotZoneAt(pos, hoop);

    // Défenseur le plus proche → contest sur tir
    let contestDist = Infinity;
    (Object.keys(defPos) as DefenderId[]).forEach((dId) => {
      const d = defPos[dId];
      const dd = distance({ x: d.x, y: d.y }, pos);
      if (dd < contestDist) contestDist = dd;
    });
    const shotQuality = shotQualityAt(pos, contestDist, hoop, profiles?.[oId]);

    // Receivability — si non porteur, dépend de l'ouverture de la ligne de passe
    let receivability = 1;
    const isCarrier = oId === carrier;
    if (!isCarrier && carrierPos) {
      let minClearance = Infinity;
      (Object.keys(defPos) as DefenderId[]).forEach((dId) => {
        const d = defPos[dId];
        const dd = distancePointToSegment({ x: d.x, y: d.y }, carrierPos, pos);
        if (dd < minClearance) minClearance = dd;
      });
      // 3 paliers cohérents avec computeMetrics : <18 bloquée, <35 contestée, sinon ouverte
      if (minClearance < 18) receivability = 0.2;
      else if (minClearance < 35) receivability = 0.6;
      else receivability = 1;
    }

    result[oId] = {
      attackerId: oId,
      score: shotQuality * receivability,
      shotQuality,
      receivability,
      contestDist: Math.round(contestDist),
      zone,
      isCarrier,
    };
  });

  return result;
}

/** Renvoie l'attaquant avec le meilleur score (la "meilleure option offensive"). */
export function bestOffensiveOption(
  threats: Record<AttackerId, AttackerThreat>
): AttackerThreat | null {
  let best: AttackerThreat | null = null;
  Object.values(threats).forEach((t) => {
    if (!best || t.score > best.score) best = t;
  });
  return best;
}
