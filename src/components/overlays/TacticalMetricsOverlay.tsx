'use client';

import type { AttackerPositions, AttackerId, Point } from '@/lib/types';
import {
  convexHull,
  buildEJO,
  evaluateSpacing,
  EJO_CORRIDOR_NARROW_PX,
} from '@/lib/logic/tactical';

interface TacticalMetricsOverlayProps {
  off: AttackerPositions;
  carrier: AttackerId;
  hoop: Point;
  show: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  grappe: '#dc2626',
  comete: '#f59e0b',
  etalement: '#3b82f6',
  expert: '#10b981',
};

const LEVEL_LABELS: Record<string, string> = {
  grappe: 'Grappe',
  comete: 'Comète',
  etalement: 'Étalement',
  expert: 'Expert',
};

export function TacticalMetricsOverlay({
  off,
  carrier,
  hoop,
  show,
}: TacticalMetricsOverlayProps) {
  if (!show) return null;
  const ball = off[carrier];
  if (!ball) return null;

  const attackerPts = Object.values(off);
  const hull = convexHull(attackerPts);
  const ejo = buildEJO(ball, hoop, EJO_CORRIDOR_NARROW_PX);
  const report = evaluateSpacing(off);
  const color = LEVEL_COLORS[report.level] ?? '#475569';
  const label = LEVEL_LABELS[report.level] ?? report.level;

  // Couloir EJO : rectangle perpendiculaire à l'axe ballon→panier,
  // demi-largeur EJO_CORRIDOR_NARROW_PX de chaque côté.
  const perp = { x: -ejo.axis.y, y: ejo.axis.x };
  const w = EJO_CORRIDOR_NARROW_PX;
  const corners =
    ejo.length > 0
      ? [
          { x: ejo.ball.x + perp.x * w, y: ejo.ball.y + perp.y * w },
          { x: ejo.target.x + perp.x * w, y: ejo.target.y + perp.y * w },
          { x: ejo.target.x - perp.x * w, y: ejo.target.y - perp.y * w },
          { x: ejo.ball.x - perp.x * w, y: ejo.ball.y - perp.y * w },
        ]
      : [];

  // Badge en haut à gauche de la bbox du hull (évite la collision avec les
  // joueurs au centre).
  let minX = Infinity;
  let minY = Infinity;
  for (const p of attackerPts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  const badgeX = minX;
  const badgeY = Math.max(20, minY - 28);

  return (
    <g pointerEvents="none">
      {corners.length > 0 && (
        <polygon
          points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="#fbbf24"
          fillOpacity={0.08}
          stroke="#fbbf24"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.9}
        />
      )}

      {hull.length >= 3 && (
        <polygon
          points={hull.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={color}
          fillOpacity={0.06}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.85}
        />
      )}

      <rect
        x={badgeX}
        y={badgeY}
        width={108}
        height={22}
        fill="rgba(255,255,255,0.95)"
        stroke={color}
        strokeWidth={1.5}
        rx={4}
      />
      <text
        x={badgeX + 8}
        y={badgeY + 14}
        fill={color}
        fontSize={11}
        fontWeight={700}
      >
        EJE · {label}
      </text>
      <text
        x={badgeX + 108 - 8}
        y={badgeY + 14}
        textAnchor="end"
        fill="#475569"
        fontSize={9}
        fontWeight={500}
      >
        {Math.round(report.ejeArea)} px²
      </text>
    </g>
  );
}
