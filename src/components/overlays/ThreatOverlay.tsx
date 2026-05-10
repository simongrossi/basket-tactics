import type { AttackerId, AttackerPositions } from '@/lib/types';
import type { AttackerThreat } from '@/lib/logic/threats';

interface ThreatOverlayProps {
  off: AttackerPositions;
  threats: Record<AttackerId, AttackerThreat>;
  show: boolean;
  /** Couches à rendre. `rings` doit passer AVANT les sprites joueurs (icônes
   *  visibles par-dessus l'anneau). `badges` doit passer APRÈS pour rester
   *  lisibles au-dessus du joueur. `all` (default) = compatibilité backwards. */
  layer?: 'all' | 'rings' | 'badges';
}

/**
 * Affiche un anneau coloré + badge % autour de chaque attaquant indiquant
 * son score de menace (probabilité de marquer s'il devient l'option
 * offensive). Vert = ouvert/forte menace, rouge = locked/faible menace.
 *
 * Le score combine qualité du tir (zone + contest) et receivability
 * (passe ouverte / contestée / bloquée). Voir `lib/logic/threats.ts`.
 */
export function ThreatOverlay({ off, threats, show, layer = 'all' }: ThreatOverlayProps) {
  if (!show) return null;
  const showRings = layer === 'all' || layer === 'rings';
  const showBadges = layer === 'all' || layer === 'badges';

  return (
    <g pointerEvents="none">
      {showBadges && (
        <defs>
          <filter id="threat-badge-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.45" />
          </filter>
        </defs>
      )}
      {(Object.keys(off) as AttackerId[]).map((oId) => {
        const t = threats[oId];
        if (!t) return null;
        const pos = off[oId];
        const ringStroke = ringColor(t.score);
        const badgeFill = badgeBgColor(t.score);
        const pct = Math.round(t.score * 100);
        return (
          <g key={oId}>
            {/* Anneau de menace autour du joueur — rendu sous les sprites. */}
            {showRings && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={26}
                fill="none"
                stroke={ringStroke}
                strokeWidth={2.5}
                strokeOpacity={0.85}
                strokeDasharray={t.isCarrier ? undefined : '5 3'}
              />
            )}
            {/* Badge % bas-droite : fond sombre teinté + texte blanc, halo
                blanc + drop-shadow. Position +24/+24 pour ne pas chevaucher
                l'icône joueur. Rendu APRÈS les sprites pour rester lisible. */}
            {showBadges && (
              <g transform={`translate(${pos.x + 24}, ${pos.y + 24})`} filter="url(#threat-badge-shadow)">
                <rect
                  x={-16}
                  y={-9}
                  width={32}
                  height={18}
                  rx={4}
                  fill={badgeFill}
                  stroke="#ffffff"
                  strokeWidth={1.4}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={11}
                  fontWeight={800}
                  style={{ letterSpacing: 0.3 }}
                >
                  {pct}%
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Anneau autour du joueur — couleur saturée pour identité visuelle. */
function ringColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 0.6));
  const hue = Math.round(t * 120);
  return `hsl(${hue}, 75%, 45%)`;
}

/**
 * Fond du badge — version assombrie du score color pour que le texte blanc
 * reste lisible quel que soit le hue (notamment yellow/orange où white-on-light
 * était illisible). Lightness 30% donne un contraste WCAG AA avec #fff.
 */
function badgeBgColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 0.6));
  const hue = Math.round(t * 120);
  return `hsl(${hue}, 70%, 30%)`;
}
