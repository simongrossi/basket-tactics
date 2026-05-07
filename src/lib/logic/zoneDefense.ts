import type {
  Point,
  AttackerId,
  DefenderId,
  AttackerPositions,
  ZoneLayout,
  ZoneConfig,
  ZoneRegion,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { manTarget, carrierDefenderTarget } from './manDefense';

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
 * Rayon de "responsabilité étendue" autour du homePos d'une zone : un
 * défenseur de zone partagera son attention sur les attaquants à moins de
 * cette distance de son ancrage. Au-delà → 0% engagement (il reste à son
 * homePos). En deçà → engagement croissant linéairement (100% à 0px).
 *
 * Conséquence : pas de saut quand un attaquant traverse la frontière du
 * polygone — le défenseur l'accompagne progressivement.
 */
const ZONE_RESPONSIBILITY_RADIUS = 200;

export function computeZoneTargets(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  layout: ZoneLayout,
  config: ZoneConfig,
  defenseDistance: number,
  hoop: Point = HOOP
): Record<DefenderId, ZoneDefenderTarget> {
  const zoneAttackers = mapAttackersToZones(off, layout);
  const ballPos = off[ballCarrier];
  const ballPressureFactor = config.ballPressure / 100;

  const targets = {} as Record<DefenderId, ZoneDefenderTarget>;

  layout.forEach((zone) => {
    const dId = zone.assignedTo;
    const homePos = zone.homePos;
    const radius = zone.radius ?? ZONE_RESPONSIBILITY_RADIUS;
    const mode = zone.mode ?? 'auto';

    // Position de "home shifté vers le ballon" — base quand pas d'engagement.
    const homeShifted = ballPos
      ? {
          x: homePos.x + (ballPos.x - homePos.x) * ballPressureFactor * 0.3,
          y: homePos.y + (ballPos.y - homePos.y) * ballPressureFactor * 0.15,
        }
      : homePos;

    // Trouve l'attaquant primaire à suivre : toujours le plus proche du
    // homePos (sans coupure dure). On lit le rayon comme un "rayon de
    // responsabilité forte" — l'engagement décroît au-delà mais ne tombe
    // pas à zéro brutalement. Permet au défenseur d'accompagner un attaquant
    // qui sort un peu de sa zone, sans téléportation.
    let primaryAttacker: AttackerId | null = null;
    let primaryDist = Infinity;
    (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
      const d = distance(pos, homePos);
      if (d < primaryDist) {
        primaryDist = d;
        primaryAttacker = oId;
      }
    });
    // Préférence porteur : s'il est raisonnablement proche du primary
    // (≤ +60px), il prend la priorité.
    if (ballCarrier && off[ballCarrier]) {
      const carrierDist = distance(off[ballCarrier], homePos);
      if (carrierDist < primaryDist + 60) {
        primaryAttacker = ballCarrier;
        primaryDist = carrierDist;
      }
    }

    if (!primaryAttacker) {
      targets[dId] = {
        x: Math.round(homeShifted.x),
        y: Math.round(homeShifted.y),
        zoneId: zone.id,
        isRotating: false,
        trackedAttacker: null,
      };
      return;
    }

    // Engagement avec falloff quadratique doux : reste élevé dans la zone
    // d'influence puis décroît rapidement au-delà du rayon × 1.5.
    //   dist = 0          → 1.00 (full track)
    //   dist = radius/2   → 0.89
    //   dist = radius     → 0.56 (l'attaquant est à la limite de la zone)
    //   dist = radius×1.5 → 0    (full home)
    // Permet au défenseur d'accompagner un attaquant sur la majorité de sa
    // zone, sans téléportation au franchissement de frontière.
    const normDist = primaryDist / (radius * 1.5);
    let engagement = Math.max(0, 1 - normDist * normDist);
    // Modulation par mode :
    // - agressif : engagement boosté (+50%, capé à 1) → sortir vite et fort
    // - passif : engagement réduit ×0.5 → reste près du home
    // - trap : full track si le porteur est dans la région (engagement = 1)
    if (mode === 'agressif') engagement = Math.min(1, engagement * 1.5);
    else if (mode === 'passif') engagement *= 0.5;
    else if (mode === 'trap' && primaryAttacker === ballCarrier) engagement = 1;

    const attPos = off[primaryAttacker];
    let trackedPos: Point;

    if (primaryAttacker === ballCarrier) {
      // En mode trap, on adopte un comportement bumper (corps entre porteur
      // et panier, plus rapproché) pour matérialiser le piège.
      const stance = mode === 'trap' ? 'bumper' : 'contester';
      const carrierTarget = carrierDefenderTarget(stance, attPos, defenseDistance, hoop);
      trackedPos = carrierTarget || homePos;
    } else if (config.type === 'zone-matchup') {
      trackedPos = manTarget(attPos, defenseDistance, hoop) || homePos;
    } else {
      const manPos = manTarget(attPos, defenseDistance * 1.2, hoop);
      if (manPos && ballPos) {
        const ballShift = ballPressureFactor * 0.15;
        trackedPos = {
          x: manPos.x + (ballPos.x - manPos.x) * ballShift,
          y: manPos.y + (ballPos.y - manPos.y) * ballShift,
        };
      } else {
        trackedPos = manPos || homePos;
      }
    }

    // Blend continu home-shifté ↔ tracking selon l'engagement.
    const blended = {
      x: homeShifted.x + (trackedPos.x - homeShifted.x) * engagement,
      y: homeShifted.y + (trackedPos.y - homeShifted.y) * engagement,
    };

    targets[dId] = {
      x: Math.round(blended.x),
      y: Math.round(blended.y),
      zoneId: zone.id,
      isRotating: false,
      // Marque comme tracké seulement si engagement significatif (> 50%) —
      // évite d'afficher un matchup qui clignote sur les frontières.
      trackedAttacker: engagement > 0.5 ? primaryAttacker : null,
    };
  });

  applyZoneRotation(targets, zoneAttackers, layout, off, config, hoop);

  return targets;
}

function applyZoneRotation(
  targets: Record<DefenderId, ZoneDefenderTarget>,
  zoneAttackers: Map<string, AttackerId[]>,
  layout: ZoneLayout,
  off: AttackerPositions,
  _config: ZoneConfig,
  hoop: Point = HOOP
): void {
  const overloaded: string[] = [];
  const empty: string[] = [];

  layout.forEach((zone) => {
    const count = (zoneAttackers.get(zone.id) || []).length;
    if (count >= 2) overloaded.push(zone.id);
    if (count === 0) empty.push(zone.id);
  });

  if (overloaded.length === 0 || empty.length === 0) return;

  // Pour chaque zone surchargée, on prend la zone vide la plus proche disponible
  // et on lui assigne le 2e attaquant (secondaire). Une zone vide "consommée"
  // n'est pas réutilisée → on évite que plusieurs défenseurs convergent vers
  // le même attaquant.
  const consumedEmpty = new Set<string>();

  // Tri des surchargées par "criticité" : celles près du panier d'abord (plus
  // dangereuses), pour qu'elles aient priorité sur l'aide.
  const sortedOverloaded = [...overloaded].sort((a, b) => {
    const za = layout.find((z) => z.id === a)!;
    const zb = layout.find((z) => z.id === b)!;
    return distance(za.homePos, hoop) - distance(zb.homePos, hoop);
  });

  for (const overZoneId of sortedOverloaded) {
    const overZone = layout.find((z) => z.id === overZoneId)!;

    // Trouve la zone vide la plus proche encore disponible
    let closestEmptyId: string | null = null;
    let closestDist = Infinity;
    for (const emptyId of empty) {
      if (consumedEmpty.has(emptyId)) continue;
      const emptyZone = layout.find((z) => z.id === emptyId)!;
      const d = distance(emptyZone.homePos, overZone.homePos);
      if (d < closestDist) {
        closestDist = d;
        closestEmptyId = emptyId;
      }
    }
    if (!closestEmptyId) continue;
    consumedEmpty.add(closestEmptyId);

    // Trouve l'attaquant secondaire (différent du primary tracked)
    const overAttackers = zoneAttackers.get(overZoneId) || [];
    if (overAttackers.length < 2) continue;
    const primary = targets[overZone.assignedTo].trackedAttacker;
    const secondary = overAttackers.find((a) => a !== primary);
    if (!secondary) continue;

    // Place le défenseur de la zone vide entre le secondaire et le panier
    const emptyZone = layout.find((z) => z.id === closestEmptyId)!;
    const emptyDef = emptyZone.assignedTo;
    const shiftTarget = manTarget(off[secondary], 50, hoop);
    if (shiftTarget) {
      targets[emptyDef] = {
        x: Math.round(shiftTarget.x),
        y: Math.round(shiftTarget.y),
        zoneId: closestEmptyId,
        isRotating: true,
        trackedAttacker: secondary,
      };
    }
  }
}
