'use client';

import type {
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  AttackerId,
  Point,
} from '@/lib/types';

interface PassLanesOverlayProps {
  off: AttackerPositions;
  defPos: ComputedDefense;
  carrier: AttackerId;
  show: boolean;
  /** Affiche les passes contestées (jaune). Default true. */
  showContested?: boolean;
  /** Affiche les passes bloquées (rouge). Default true. */
  showBlocked?: boolean;
}

/**
 * Distance d'un point à un segment [a, b].
 */
function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

/**
 * Trace une ligne de passe par destinataire potentiel, colorée selon
 * l'ouverture (vert clair = nette, jaune = contestée, rouge = bloquée).
 */
export function PassLanesOverlay({
  off, defPos, carrier, show, showContested = true, showBlocked = true,
}: PassLanesOverlayProps) {
  if (!show) return null;
  const carrierPos = off[carrier];
  if (!carrierPos) return null;

  const defenders = Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][];

  return (
    <g pointerEvents="none">
      {(Object.entries(off) as [AttackerId, Point][]).map(([id, pos]) => {
        if (id === carrier) return null;
        // Plus petit "écart" entre la ligne et un défenseur = passe contestée
        let minClearance = Infinity;
        defenders.forEach(([, d]) => {
          const dist = distancePointToSegment({ x: d.x, y: d.y }, carrierPos, pos);
          if (dist < minClearance) minClearance = dist;
        });

        // Catégorisation : < 18px = bloquée, 18-35 contestée, > 35 ouverte
        let color = '#10b981'; // green = open
        let strokeWidth = 2.5;
        let dashArray = '6 3';
        let opacity = 0.85;
        let label = 'ouverte';
        let labelBg = '#10b981';
        let category: 'open' | 'contested' | 'blocked' = 'open';
        if (minClearance < 18) {
          color = '#dc2626';
          strokeWidth = 1.8;
          dashArray = '3 4';
          opacity = 0.7;
          label = 'bloquée';
          labelBg = '#dc2626';
          category = 'blocked';
        } else if (minClearance < 35) {
          color = '#f59e0b';
          strokeWidth = 2.2;
          dashArray = '5 3';
          opacity = 0.85;
          label = 'contestée';
          labelBg = '#f59e0b';
          category = 'contested';
        }
        // Filtres par catégorie : on peut masquer contestées et/ou bloquées
        // sans toucher aux passes ouvertes (qui restent l'info la plus utile).
        if (category === 'contested' && !showContested) return null;
        if (category === 'blocked' && !showBlocked) return null;

        // Point milieu pour le badge
        const mx = (carrierPos.x + pos.x) / 2;
        const my = (carrierPos.y + pos.y) / 2;

        return (
          <g key={id}>
            <line
              x1={carrierPos.x}
              y1={carrierPos.y}
              x2={pos.x}
              y2={pos.y}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              opacity={opacity}
            />
            <rect
              x={mx - 28}
              y={my - 8}
              width={56}
              height={16}
              fill="rgba(255,255,255,0.92)"
              stroke={labelBg}
              strokeWidth={1}
              rx={3}
            />
            <text
              x={mx}
              y={my + 4}
              textAnchor="middle"
              fill={labelBg}
              fontSize={9}
              fontWeight={600}
            >
              {id} · {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
