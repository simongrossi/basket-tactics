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

    // Position de "home shifté vers le ballon" — base quand pas d'engagement.
    const homeShifted = ballPos
      ? {
          x: homePos.x + (ballPos.x - homePos.x) * ballPressureFactor * 0.3,
          y: homePos.y + (ballPos.y - homePos.y) * ballPressureFactor * 0.15,
        }
      : homePos;

    // Trouve l'attaquant primaire à suivre : le plus proche du homePos dans
    // un rayon de responsabilité étendu, avec préférence pour le porteur si
    // proche. Cette logique remplace l'assignation discrète par polygone.
    let primaryAttacker: AttackerId | null = null;
    let primaryDist = ZONE_RESPONSIBILITY_RADIUS;
    (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
      const d = distance(pos, homePos);
      if (d < primaryDist) {
        primaryDist = d;
        primaryAttacker = oId;
      }
    });
    // Préférence porteur : s'il est dans le rayon et raisonnablement proche
    // (≤ +60px du primary actuel), il prend la priorité.
    if (ballCarrier && off[ballCarrier]) {
      const carrierDist = distance(off[ballCarrier], homePos);
      if (carrierDist < ZONE_RESPONSIBILITY_RADIUS && carrierDist < primaryDist + 60) {
        primaryAttacker = ballCarrier;
        primaryDist = carrierDist;
      }
    }

    if (!primaryAttacker) {
      // Aucun attaquant dans le rayon → défenseur reste au home shifté.
      targets[dId] = {
        x: Math.round(homeShifted.x),
        y: Math.round(homeShifted.y),
        zoneId: zone.id,
        isRotating: false,
        trackedAttacker: null,
      };
      return;
    }

    // Engagement linéaire : 1.0 à 0px du home, 0.0 au bord du rayon.
    const engagement = Math.max(0, 1 - primaryDist / ZONE_RESPONSIBILITY_RADIUS);

    const attPos = off[primaryAttacker];
    let trackedPos: Point;

    if (primaryAttacker === ballCarrier) {
      const carrierTarget = carrierDefenderTarget('contester', attPos, defenseDistance, hoop);
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
