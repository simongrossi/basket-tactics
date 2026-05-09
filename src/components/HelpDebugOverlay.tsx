import type { ComputedDefense, DefenderId, HelpPriority } from '@/lib/types';

interface HelpDebugOverlayProps {
  defPos: ComputedDefense;
  /** Seuil minimal de helpFactor pour afficher la flèche. Default 0.10 —
   *  filtre les micro-pulls de denial (~0.05) qui pollueraient la vue. */
  minHelpFactor?: number;
}

/**
 * Vue debug d'aide défensive. Pour chaque défenseur dont l'aide est non-
 * négligeable, dessine :
 *  - une flèche de la position du défenseur vers son `helpAim` (cible idéale
 *    de l'aide, avant blend par helpFactor),
 *  - un badge `xx%` sur la flèche indiquant l'intensité,
 *  - un tag textuel court de la priorité (paint / man / passlane) ou du rôle
 *    PnR (tag / x-out / stunt).
 *
 * Couleurs :
 *  - paint  : violet (#8b5cf6)
 *  - man    : bleu  (#3b82f6)
 *  - passlane : émeraude (#10b981)
 *  - PnR tag : ambre (#f59e0b)
 *  - PnR x-out : magenta (#a855f7)
 *  - PnR stunt : bleu pâle (#60a5fa)
 *  - denial strong-side : cyan (#0EA5A8)
 */
export function HelpDebugOverlay({ defPos, minHelpFactor = 0.10 }: HelpDebugOverlayProps) {
  const entries = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).filter(
    ([, p]) => p.helpAim && p.helpFactor >= minHelpFactor
  );
  if (entries.length === 0) return null;

  return (
    <g pointerEvents="none">
      <defs>
        <marker
          id="help-debug-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {entries.map(([id, p]) => {
        const aim = p.helpAim!;
        const { color, label } = styleFor(p);
        const dx = aim.x - p.x;
        const dy = aim.y - p.y;
        const mid = { x: p.x + dx * 0.55, y: p.y + dy * 0.55 };
        const pct = Math.round(p.helpFactor * 100);
        // Évite d'afficher quand la flèche est nano (le défenseur est déjà
        // sur sa cible : helpFactor élevé mais aim très proche).
        const arrowLen = Math.hypot(dx, dy);
        if (arrowLen < 6) return null;
        return (
          <g key={id} style={{ color }}>
            <line
              x1={p.x}
              y1={p.y}
              x2={aim.x}
              y2={aim.y}
              stroke={color}
              strokeWidth={1.6}
              strokeDasharray="6 3"
              opacity={0.85}
              markerEnd="url(#help-debug-arrow)"
            />
            <rect
              x={mid.x - 22}
              y={mid.y - 8}
              width={44}
              height={16}
              fill="rgba(255,255,255,0.95)"
              stroke={color}
              strokeWidth={1}
              rx={3}
            />
            <text
              x={mid.x}
              y={mid.y + 4}
              textAnchor="middle"
              fill={color}
              fontSize={10}
              fontWeight={700}
            >
              {pct}% · {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface StyledHelp {
  color: string;
  label: string;
}

function styleFor(p: ComputedDefense[DefenderId]): StyledHelp {
  // PnR rotation prime sur la priorité d'aide standard (les targets ont été
  // overridés par computePnRRotations).
  if (p.pnrRole === 'tag') return { color: '#f59e0b', label: 'TAG' };
  if (p.pnrRole === 'x-out') return { color: '#a855f7', label: 'X-OUT' };
  if (p.pnrRole === 'stunt') return { color: '#60a5fa', label: 'STUNT' };

  if (p.helpKind === 'denial-strongside') {
    return { color: '#0EA5A8', label: 'DENY' };
  }

  switch (p.helpPriority as HelpPriority | undefined) {
    case 'paint':    return { color: '#8b5cf6', label: 'PAINT' };
    case 'passlane': return { color: '#10b981', label: 'PASS' };
    case 'man':      return { color: '#3b82f6', label: 'MAN' };
    default:         return { color: '#64748b', label: 'AIDE' };
  }
}
