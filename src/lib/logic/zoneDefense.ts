import type {
  Point,
  AttackerId,
  DefenderId,
  AttackerPositions,
  ZoneLayout,
  ZoneConfig,
  ZoneRegion,
  ZoneType,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { manTarget, carrierDefenderTarget } from './manDefense';
import { baseMatchups } from '../data/initial';
import { detectOverload, findCriticalZoneAttackers } from './zoneSituations';

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Mapping diagnostic : pour chaque zone, liste les attaquants présents dans
 * son polygone (avec fallback "homePos le plus proche" si l'attaquant n'est
 * dans aucun polygone). Utilisé par la visu de couverture (ZoneCoverage.tsx)
 * — ce n'est PLUS la base du calcul des positions défensives.
 *
 * Le moteur (computeZoneTargets) raisonne maintenant en ownership continu
 * basé sur la distance aux homePos, ce qui élimine les téléportations aux
 * frontières de polygone.
 */
export function mapAttackersToZones(
  off: AttackerPositions,
  layout: ZoneLayout
): Map<string, AttackerId[]> {
  const result = new Map<string, AttackerId[]>();
  layout.forEach((z) => result.set(z.id, []));

  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
    let bestZone: ZoneRegion | null = null;
    let bestDist = Infinity;
    for (const zone of layout) {
      if (pointInPolygon(pos, zone.polygon)) {
        bestZone = zone;
        break;
      }
      const d = distance(pos, zone.homePos);
      if (d < bestDist) {
        bestDist = d;
        bestZone = zone;
      }
    }
    if (bestZone) {
      result.get(bestZone.id)!.push(oId);
    }
  });

  return result;
}

export interface ZoneDefenderTarget {
  x: number;
  y: number;
  zoneId: string;
  isRotating: boolean;
  trackedAttacker: AttackerId | null;
}

/**
 * Portée gaussienne de référence (px). À cette distance du homePos, un
 * attaquant produit ~37% du claim max. À 2× cette distance → ~2%.
 * Au-delà, le défenseur est en pratique désengagé. Surchargeable par
 * région via `ZoneRegion.radius`.
 */
const BASE_REACH = 200;

/** Largeur du demi-terrain (px). Centre vertical = COURT_CENTER_X. */
const COURT_CENTER_X = 300;

/**
 * Paramètres tactiques par type de zone. Pondèrent le calcul des "claims"
 * (intérêt d'un défenseur pour chaque attaquant) selon les principes
 * spécifiques à chaque formation. Tout le moteur reste générique : seules
 * ces 4 valeurs changent par type, et c'est suffisant pour différencier
 * 2-3 (back-3 protègent, top-2 pression) de 1-3-1 (point top, baseline
 * rotative) de match-up (man-like dans la zone).
 */
interface ZoneTactic {
  /** Bonus pour le matchup naturel (D3↔O3). 1.0 = neutre, >1 = préfère */
  naturalBonus: number;
  /** Bonus quand l'attaquant est le porteur (pression ballon globale). */
  carrierBonus: number;
  /** Force du shift ball-side appliqué au homePos. 0 = pas d'aide,
   *  0.5 = aide forte. Le défenseur faible-côté reçoit le shift complet,
   *  le fort-côté seulement 30%, le central 60%. */
  ballSideHelp: number;
  /** Multiplicateur sur BASE_REACH. >1 = défenseurs plus élastiques. */
  reachMultiplier: number;
}

const DEFAULT_TACTIC: ZoneTactic = {
  naturalBonus: 1.2,
  carrierBonus: 1.4,
  ballSideHelp: 0.4,
  reachMultiplier: 1.0,
};

const TACTICS: Record<ZoneType, ZoneTactic> = {
  // 2-3 : front-2 pressent dehors, back-3 protègent la peinture avec
  // glissement ball-side. Reach standard, aide ball-side soutenue.
  'zone-2-3': {
    naturalBonus: 1.2,
    carrierBonus: 1.5,
    ballSideHelp: 0.5,
    reachMultiplier: 1.0,
  },
  // 3-2 : front-3 sur le périmètre (pression à l'arc), back-2 protègent
  // la raquette. Reach légèrement compressé pour rester serré ; ball-side
  // help discret car le top-3 couvre déjà la rotation horizontale.
  'zone-3-2': {
    naturalBonus: 1.3,
    carrierBonus: 1.6,
    ballSideHelp: 0.35,
    reachMultiplier: 0.95,
  },
  // 1-3-1 : point-top fait la pression seule, le milieu doit beaucoup
  // glisser ball-side, et la baseline pivote fortement. Aide élevée.
  'zone-1-3-1': {
    naturalBonus: 1.15,
    carrierBonus: 1.4,
    ballSideHelp: 0.6,
    reachMultiplier: 1.05,
  },
  // 2-1-2 : front-2 + post haut + back-2. Comportement proche de 2-3 mais
  // avec un défenseur central qui ferme le high-post.
  'zone-2-1-2': {
    naturalBonus: 1.2,
    carrierBonus: 1.5,
    ballSideHelp: 0.5,
    reachMultiplier: 1.0,
  },
  // Match-up : hybride zone/individuelle. Bonus naturel très fort —
  // chaque défenseur "colle" son joueur tant qu'il reste à portée.
  'zone-matchup': {
    naturalBonus: 2.0,
    carrierBonus: 1.3,
    ballSideHelp: 0.25,
    reachMultiplier: 1.0,
  },
};

/**
 * Décale le homePos vers le côté du ballon. Asymétrique : le défenseur
 * faible-côté glisse beaucoup (× 1.0), le fort-côté peu (× 0.3) — il est
 * déjà près du ballon —, le central modérément (× 0.6). Plafonné à 80px
 * pour ne pas sortir un défenseur de sa zone.
 */
function ballSideShifted(home: Point, ballPos: Point, helpFactor: number): Point {
  const ballOffset = ballPos.x - COURT_CENTER_X;
  const homeOffset = home.x - COURT_CENTER_X;
  const homeIsCenter = Math.abs(homeOffset) < 30;
  let sideMult: number;
  if (homeIsCenter) sideMult = 0.6;
  else if (Math.sign(homeOffset) === Math.sign(ballOffset)) sideMult = 0.3;
  else sideMult = 1.0;
  const shiftX = Math.max(-80, Math.min(80, ballOffset * helpFactor * 0.4 * sideMult));
  return { x: home.x + shiftX, y: home.y };
}

/**
 * Calcule les positions cibles des défenseurs en zone, avec un moteur
 * 100% continu (zéro seuil binaire) :
 *
 * 1. Pour chaque (défenseur, attaquant), un "claim" gaussien :
 *      claim = exp(-(d/reach)²) × naturalBonus × carrierBonus
 *    Plus de pointInPolygon → plus de saut de priorité aux frontières.
 *
 * 2. Pour chaque attaquant, on normalise les claims des 5 défenseurs en
 *    parts d'ownership (sommant à 1). C'est la "compétition" pour cet
 *    attaquant : si deux défenseurs sont équidistants, ils ont 0.5/0.5.
 *
 * 3. Chaque défenseur prend pour primary l'attaquant qu'il possède le
 *    plus, et son engagement = sa part. Contesté = engagement modéré,
 *    dominant = engagement fort. Pas de seuil → pas de téléportation.
 *
 * Les paramètres tactiques (TACTICS) modulent ces claims selon le type
 * de zone : un 1-3-1 sage davantage ball-side qu'un match-up, un 3-2
 * pressente plus le porteur qu'un 2-3, etc.
 */
export function computeZoneTargets(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  layout: ZoneLayout,
  config: ZoneConfig,
  defenseDistance: number,
  hoop: Point = HOOP
): Record<DefenderId, ZoneDefenderTarget> {
  const tactic = TACTICS[config.type] ?? DEFAULT_TACTIC;
  const ballPos = off[ballCarrier];
  const ballPressureFactor = config.ballPressure / 100;

  // P3 — Situations tactiques de zone :
  //  - overload côté ballon (3+ attaquants) → boost le glissement collectif.
  //  - short corner / high post → boost le claim sur ces attaquants pour
  //    forcer la couverture de ces "trous" classiques de zone.
  const overload = detectOverload(off, ballCarrier, hoop);
  const effectiveBallSideHelp =
    tactic.ballSideHelp * (1 + overload.intensity * 0.6);
  const criticalAttackers = findCriticalZoneAttackers(off, hoop);
  const criticalIds = new Set(criticalAttackers.map((c) => c.attackerId));

  // Pré-calcul du homePos shifté ball-side pour chaque zone (avec boost overload).
  const shiftedHomes = new Map<DefenderId, Point>();
  layout.forEach((zone) => {
    const home = ballPos
      ? ballSideShifted(zone.homePos, ballPos, effectiveBallSideHelp)
      : zone.homePos;
    shiftedHomes.set(zone.assignedTo, home);
  });

  // Étape 1 — Claims continus.
  const claims = new Map<DefenderId, Map<AttackerId, number>>();
  layout.forEach((zone) => {
    const dId = zone.assignedTo;
    const home = shiftedHomes.get(dId)!;
    const naturalAtt = baseMatchups[dId];
    const reach = (zone.radius ?? BASE_REACH) * tactic.reachMultiplier;

    const dClaims = new Map<AttackerId, number>();
    (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
      const d = distance(pos, home);
      const proximity = Math.exp(-Math.pow(d / reach, 2));
      const naturalMult = oId === naturalAtt ? tactic.naturalBonus : 1.0;
      const carrierMult = oId === ballCarrier ? tactic.carrierBonus : 1.0;
      // P3 — Boost critique : un attaquant en short-corner ou high-post
      // est attractif pour TOUS les défenseurs nearby (pas seulement le
      // matchup naturel). Multiplie le claim de chaque défenseur sur cet
      // attaquant. Effet : la zone rotate vraiment pour fermer ces spots
      // au lieu d'attendre que le matchup naturel arrive.
      const criticalMult = criticalIds.has(oId) ? 1.4 : 1.0;
      dClaims.set(oId, proximity * naturalMult * carrierMult * criticalMult);
    });
    claims.set(dId, dClaims);
  });

  // Étape 2 — Ownership normalisée par attaquant. Epsilon stabilise le
  // dénominateur quand tous les claims sont quasi-nuls (attaquant isolé).
  const ownership = new Map<DefenderId, Map<AttackerId, number>>();
  layout.forEach((z) => ownership.set(z.assignedTo, new Map()));
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    const totalClaim = layout.reduce(
      (sum, z) => sum + (claims.get(z.assignedTo)!.get(oId) ?? 0),
      0
    );
    const denom = totalClaim + 1e-6;
    layout.forEach((z) => {
      const c = claims.get(z.assignedTo)!.get(oId) ?? 0;
      ownership.get(z.assignedTo)!.set(oId, c / denom);
    });
  });

  // Étape 3 — Pour chaque défenseur, position cible = blend(home, tracking)
  // pondéré par sa part d'ownership sur le primary. Continu, pas de saut.
  const targets = {} as Record<DefenderId, ZoneDefenderTarget>;

  layout.forEach((zone) => {
    const dId = zone.assignedTo;
    const home = shiftedHomes.get(dId)!;
    const mode = zone.mode ?? 'auto';

    // Pression ballon globale additionnelle (le slider config.ballPressure
    // s'ajoute au ball-side help tactique). Tire le home vers le porteur.
    const homeShifted = ballPos
      ? {
          x: home.x + (ballPos.x - home.x) * ballPressureFactor * 0.15,
          y: home.y + (ballPos.y - home.y) * ballPressureFactor * 0.10,
        }
      : home;

    // Sélection du primary par max ownership.
    let primaryAttacker: AttackerId | null = null;
    let primaryShare = 0;
    (Object.keys(off) as AttackerId[]).forEach((oId) => {
      const share = ownership.get(dId)!.get(oId) ?? 0;
      if (share > primaryShare) {
        primaryShare = share;
        primaryAttacker = oId;
      }
    });

    // Seuil minimum d'engagement pour bouger : si on possède très peu
    // d'attaquants (tous les attaquants sont loin), on reste au home.
    if (!primaryAttacker || primaryShare < 0.15) {
      targets[dId] = {
        x: Math.round(homeShifted.x),
        y: Math.round(homeShifted.y),
        zoneId: zone.id,
        isRotating: false,
        trackedAttacker: null,
      };
      return;
    }

    let engagement = primaryShare;
    // Modulation par mode :
    // - agressif : +50% (capé à 1) → sortir vite et fort
    // - passif : ×0.5 → reste près du home
    // - trap : full track sur le porteur
    if (mode === 'agressif') engagement = Math.min(1, engagement * 1.5);
    else if (mode === 'passif') engagement *= 0.5;
    else if (mode === 'trap' && primaryAttacker === ballCarrier) engagement = 1;

    const primary: AttackerId = primaryAttacker;
    const attPos = off[primary];
    let trackedPos: Point;
    if (primary === ballCarrier) {
      const stance = mode === 'trap' ? 'bumper' : 'contester';
      trackedPos = carrierDefenderTarget(stance, attPos, defenseDistance, hoop) || home;
    } else if (config.type === 'zone-matchup') {
      trackedPos = manTarget(attPos, defenseDistance, hoop) || home;
    } else {
      trackedPos = manTarget(attPos, defenseDistance * 1.2, hoop) || home;
    }

    const blended = {
      x: homeShifted.x + (trackedPos.x - homeShifted.x) * engagement,
      y: homeShifted.y + (trackedPos.y - homeShifted.y) * engagement,
    };

    targets[dId] = {
      x: Math.round(blended.x),
      y: Math.round(blended.y),
      zoneId: zone.id,
      isRotating: false,
      // Affiche le matchup uniquement quand l'engagement est franc, pour
      // éviter les lignes qui clignotent sur les zones contestées.
      trackedAttacker: engagement > 0.4 ? primary : null,
    };
  });

  return targets;
}
