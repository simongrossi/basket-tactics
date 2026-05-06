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

export function computeZoneTargets(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  layout: ZoneLayout,
  config: ZoneConfig,
  defenseDistance: number
): Record<DefenderId, ZoneDefenderTarget> {
  const zoneAttackers = mapAttackersToZones(off, layout);
  const ballPos = off[ballCarrier];

  const targets = {} as Record<DefenderId, ZoneDefenderTarget>;

  layout.forEach((zone) => {
    const dId = zone.assignedTo;
    const attackersInZone = zoneAttackers.get(zone.id) || [];
    const ballPressureFactor = config.ballPressure / 100;

    if (attackersInZone.length === 0) {
      const homePos = zone.homePos;
      if (ballPos) {
        const shiftX = (ballPos.x - homePos.x) * ballPressureFactor * 0.3;
        const shiftY = (ballPos.y - homePos.y) * ballPressureFactor * 0.15;
        targets[dId] = {
          x: Math.round(homePos.x + shiftX),
          y: Math.round(homePos.y + shiftY),
          zoneId: zone.id,
          isRotating: false,
          trackedAttacker: null,
        };
      } else {
        targets[dId] = {
          x: homePos.x,
          y: homePos.y,
          zoneId: zone.id,
          isRotating: false,
          trackedAttacker: null,
        };
      }
      return;
    }

    let primaryAttacker: AttackerId;
    if (attackersInZone.includes(ballCarrier)) {
      primaryAttacker = ballCarrier;
    } else {
      primaryAttacker = attackersInZone.reduce((closest, oId) => {
        return distance(off[oId], HOOP) < distance(off[closest], HOOP) ? oId : closest;
      });
    }

    const attPos = off[primaryAttacker];
    let targetPos: Point;

    if (primaryAttacker === ballCarrier) {
      const carrierTarget = carrierDefenderTarget('contester', attPos, defenseDistance);
      targetPos = carrierTarget || zone.homePos;
    } else if (config.type === 'zone-matchup') {
      const manPos = manTarget(attPos, defenseDistance);
      targetPos = manPos || zone.homePos;
    } else {
      const manPos = manTarget(attPos, defenseDistance * 1.2);
      if (manPos && ballPos) {
        const ballShift = ballPressureFactor * 0.15;
        targetPos = {
          x: manPos.x + (ballPos.x - manPos.x) * ballShift,
          y: manPos.y + (ballPos.y - manPos.y) * ballShift,
        };
      } else {
        targetPos = manPos || zone.homePos;
      }
    }

    targets[dId] = {
      x: Math.round(targetPos.x),
      y: Math.round(targetPos.y),
      zoneId: zone.id,
      isRotating: false,
      trackedAttacker: primaryAttacker,
    };
  });

  applyZoneRotation(targets, zoneAttackers, layout, off, config);

  return targets;
}

function applyZoneRotation(
  targets: Record<DefenderId, ZoneDefenderTarget>,
  zoneAttackers: Map<string, AttackerId[]>,
  layout: ZoneLayout,
  off: AttackerPositions,
  config: ZoneConfig
): void {
  const overloaded: string[] = [];
  const empty: string[] = [];

  layout.forEach((zone) => {
    const count = (zoneAttackers.get(zone.id) || []).length;
    if (count >= 2) overloaded.push(zone.id);
    if (count === 0) empty.push(zone.id);
  });

  if (overloaded.length === 0 || empty.length === 0) return;

  for (const emptyZoneId of empty) {
    const emptyZone = layout.find((z) => z.id === emptyZoneId)!;
    let closestOverloaded: string | null = null;
    let closestDist = Infinity;

    for (const overZoneId of overloaded) {
      const overZone = layout.find((z) => z.id === overZoneId)!;
      const d = distance(emptyZone.homePos, overZone.homePos);
      if (d < closestDist) {
        closestDist = d;
        closestOverloaded = overZoneId;
      }
    }

    if (!closestOverloaded) continue;

    const overZoneAttackers = zoneAttackers.get(closestOverloaded) || [];
    if (overZoneAttackers.length < 2) continue;

    const secondaryAttacker = overZoneAttackers.reduce((farthest, oId) => {
      if (oId === targets[layout.find((z) => z.id === closestOverloaded)!.assignedTo].trackedAttacker) return farthest;
      return distance(off[oId], HOOP) > distance(off[farthest], HOOP) ? oId : farthest;
    });

    const emptyDef = emptyZone.assignedTo;
    const attPos = off[secondaryAttacker];
    const shiftTarget = manTarget(attPos, 60);

    if (shiftTarget) {
      targets[emptyDef] = {
        x: Math.round(shiftTarget.x),
        y: Math.round(shiftTarget.y),
        zoneId: emptyZoneId,
        isRotating: true,
        trackedAttacker: secondaryAttacker,
      };
    }
  }
}
