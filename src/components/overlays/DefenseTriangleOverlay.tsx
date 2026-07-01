import type { AttackerId, AttackerPositions, ComputedDefense, DefenderId, Point } from '@/lib/types';
import {
  defenseTriangleOverlayData,
  type TriangleVerdict,
} from '@/lib/logic/defenseTriangle';

interface DefenseTriangleOverlayProps {
  defPos: ComputedDefense;
  off: AttackerPositions;
  carrier: AttackerId;
}

/** Couleurs par verdict : open = vert (posture pistols OK), wide = ambre
 *  (tête sur pivot), flat = rouge (aligné, lecture cassée). */
const VERDICT_COLORS: Record<TriangleVerdict, string> = {
  open: '#16a34a',
  wide: '#f59e0b',
  flat: '#dc2626',
};

/**
 * Overlay pédagogique « vois ton homme, vois le ballon » (P1.3).
 * Pour chaque défenseur off-ball, dessine le triangle ballon-défenseur-homme :
 * fill translucide + les deux lignes de vision depuis le défenseur + badge
 * d'angle coloré par verdict. Strictement diagnostique — aucune influence
 * sur la physique (même contrat que ScreenDebugOverlay).
 */
export function DefenseTriangleOverlay({ defPos, off, carrier }: DefenseTriangleOverlayProps) {
  const defenders: Record<DefenderId, Point> = Object.fromEntries(
    (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(
      ([id, p]) => [id, { x: p.x, y: p.y }]
    )
  ) as Record<DefenderId, Point>;
  const matchups: Partial<Record<DefenderId, AttackerId>> = Object.fromEntries(
    (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(
      ([id, p]) => [id, p.matchedTo]
    )
  );
  const entries = defenseTriangleOverlayData(defenders, matchups, off, carrier);
  if (entries.length === 0) return null;

  return (
    <g pointerEvents="none">
      {entries.map((e) => {
        const color = VERDICT_COLORS[e.verdict];
        // Badge d'angle légèrement décalé du défenseur, vers l'extérieur du
        // triangle (opposé à la bissectrice ballon/homme).
        const bx = (e.ball.x - e.def.x + (e.man.x - e.def.x)) / 2;
        const by = (e.ball.y - e.def.y + (e.man.y - e.def.y)) / 2;
        const bLen = Math.hypot(bx, by) || 1;
        const badge = { x: e.def.x - (bx / bLen) * 22, y: e.def.y - (by / bLen) * 22 };
        return (
          <g key={e.id}>
            <polygon
              points={`${e.ball.x},${e.ball.y} ${e.def.x},${e.def.y} ${e.man.x},${e.man.y}`}
              fill={color}
              opacity={0.07}
            />
            <line
              x1={e.def.x} y1={e.def.y} x2={e.ball.x} y2={e.ball.y}
              stroke={color} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.55}
            />
            <line
              x1={e.def.x} y1={e.def.y} x2={e.man.x} y2={e.man.y}
              stroke={color} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.55}
            />
            <rect
              x={badge.x - 15} y={badge.y - 8} width={30} height={16}
              fill="rgba(255,255,255,0.92)" stroke={color} strokeWidth={1} rx={3}
            />
            <text
              x={badge.x} y={badge.y + 4} textAnchor="middle"
              fill={color} fontSize={10} fontWeight={700}
            >
              {Math.round(e.angleDeg)}°
            </text>
          </g>
        );
      })}
    </g>
  );
}
