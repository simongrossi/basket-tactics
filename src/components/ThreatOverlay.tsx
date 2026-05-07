import type { AttackerId, AttackerPositions } from '@/lib/types';
import type { AttackerThreat } from '@/lib/logic/threats';

interface ThreatOverlayProps {
  off: AttackerPositions;
  threats: Record<AttackerId, AttackerThreat>;
  /** Id de l'attaquant avec le meilleur score (couronne dorée). Null = on
   *  n'affiche pas le marqueur de "meilleure option". */
  bestId?: AttackerId | null;
  show: boolean;
}

/**
 * Affiche un anneau coloré + badge % autour de chaque attaquant indiquant
 * son score de menace (probabilité de marquer s'il devient l'option
 * offensive). Vert = ouvert/forte menace, rouge = locked/faible menace.
 *
 * Le score combine qualité du tir (zone + contest) et receivability
 * (passe ouverte / contestée / bloquée). Voir `lib/logic/threats.ts`.
 */
export function ThreatOverlay({ off, threats, bestId, show }: ThreatOverlayProps) {
  if (!show) return null;
  return (
    <g pointerEvents="none">
      {(Object.keys(off) as AttackerId[]).map((oId) => {
        const t = threats[oId];
        if (!t) return null;
        const pos = off[oId];
        const color = scoreColor(t.score);
        const pct = Math.round(t.score * 100);
        const isBest = oId === bestId;
        return (
          <g key={oId}>
            {/* Anneau de menace autour du joueur */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={26}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeOpacity={0.85}
              strokeDasharray={t.isCarrier ? undefined : '5 3'}
            />
            {/* Couronne dorée si meilleure option */}
            {isBest && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={30}
                fill="none"
                stroke="#fbbf24"
                strokeWidth={2}
                strokeOpacity={0.7}
              />
            )}
            {/* Badge % en bas-droite */}
            <g transform={`translate(${pos.x + 18}, ${pos.y + 14})`}>
              <rect
                x={-13}
                y={-7}
                width={26}
                height={14}
                rx={3}
                fill={color}
                fillOpacity={0.95}
                stroke="#fff"
                strokeWidth={1}
              />
              <text
                x={0}
                y={3}
                textAnchor="middle"
                fill="#fff"
                fontSize={9}
                fontWeight={700}
              >
                {pct}%
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** Couleur traffic-light selon le score : vert ≥ 0.45, jaune ≥ 0.30, rouge sinon. */
function scoreColor(score: number): string {
  // HSL traffic light continu — même charte que la heatmap pour cohérence visuelle.
  // 0   → rouge (hue 0)
  // 0.5 → jaune (hue 60)
  // 1   → vert  (hue 120)
  const t = Math.max(0, Math.min(1, score / 0.6)); // saturation à 0.6 = max
  const hue = Math.round(t * 120);
  return `hsl(${hue}, 75%, 45%)`;
}
