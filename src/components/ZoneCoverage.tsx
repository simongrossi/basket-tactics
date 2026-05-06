'use client';

import type {
  AttackerPositions,
  ComputedDefense,
  ZoneLayout,
  AttackerId,
  DefenderId,
  Point,
} from '@/lib/types';
import { mapAttackersToZones } from '@/lib/logic/zoneDefense';

interface ZoneCoverageProps {
  off: AttackerPositions;
  defPos: ComputedDefense;
  layout: ZoneLayout;
  show: boolean;
}

/**
 * En zone, chaque défenseur est responsable de TOUS les attaquants présents
 * dans sa zone (pas d'un seul). Ce composant trace une ligne du défenseur
 * vers chaque attaquant dans sa zone, avec :
 *  - le `trackedAttacker` (matchedTo) en trait épais et coloré
 *  - les autres attaquants de la zone (cas overload) en trait fin pointillé
 *
 * Couleur : violet pour le tracked, vert pour les "secondaires" à surveiller.
 */
export function ZoneCoverage({ off, defPos, layout, show }: ZoneCoverageProps) {
  if (!show) return null;
  const zoneAttackers = mapAttackersToZones(off, layout);

  // Pour chaque zone, on a la liste des attaquants présents.
  // On retrouve le défenseur via assignedTo.
  const lines: { from: Point; to: Point; primary: boolean; key: string }[] = [];

  layout.forEach((zone) => {
    const dId = zone.assignedTo as DefenderId;
    const d = defPos[dId];
    if (!d) return;
    const fromPos: Point = { x: d.x, y: d.y };
    const attackers = zoneAttackers.get(zone.id) || [];
    const primary = d.matchedTo;

    attackers.forEach((aId: AttackerId) => {
      const aPos = off[aId];
      if (!aPos) return;
      const isPrimary = aId === primary;
      lines.push({
        from: fromPos,
        to: aPos,
        primary: isPrimary,
        key: `${dId}-${aId}`,
      });
    });
  });

  return (
    <g pointerEvents="none">
      {lines.map((l) => (
        <line
          key={l.key}
          x1={l.from.x}
          y1={l.from.y}
          x2={l.to.x}
          y2={l.to.y}
          stroke={l.primary ? '#7c3aed' : '#10b981'}
          strokeWidth={l.primary ? 1.8 : 1.2}
          strokeDasharray={l.primary ? undefined : '4 3'}
          opacity={l.primary ? 0.7 : 0.55}
        />
      ))}
    </g>
  );
}
