import type {
  AttackerPositions,
  ComputedDefense,
  DetectedScreen,
  DetectedOffBallScreen,
  ScreenRule,
  ZoneLayout,
} from '@/lib/types';
import { manTarget } from '@/lib/logic/manDefense';

interface MatchupsProps {
  off: AttackerPositions;
  defPos: ComputedDefense;
  show: boolean;
  /** Quand false, les matchups après switch sont rendus comme les autres
   *  (gris fin) au lieu d'orange épais. Default true. */
  highlightSwitches?: boolean;
}

export function Matchups({ off, defPos, show, highlightSwitches = true }: MatchupsProps) {
  if (!show) return null;
  return (
    <g>
      {(Object.entries(defPos) as [keyof typeof defPos, ComputedDefense[keyof ComputedDefense]][]).map(
        ([dId, p]) => {
          const att = off[p.matchedTo];
          if (!att) return null;
          const isSwitched = highlightSwitches && p.switchedThisStep;
          return (
            <line
              key={dId}
              x1={p.x}
              y1={p.y}
              x2={att.x}
              y2={att.y}
              stroke={isSwitched ? '#BA7517' : '#888780'}
              strokeWidth={isSwitched ? 1.8 : 0.8}
              opacity={isSwitched ? 0.85 : 0.3}
              strokeDasharray={isSwitched ? '5 3' : undefined}
            />
          );
        }
      )}
    </g>
  );
}

interface HelpLinesProps {
  off: AttackerPositions;
  defPos: ComputedDefense;
  defenseDistance: number;
  show: boolean;
}

export function HelpLines({ off, defPos, defenseDistance, show }: HelpLinesProps) {
  if (!show) return null;
  return (
    <g>
      {(Object.entries(defPos) as [keyof typeof defPos, ComputedDefense[keyof ComputedDefense]][]).map(
        ([dId, p]) => {
          if (p.isCarrierDefender || !p.helpFactor || p.helpFactor < 0.05) return null;
          const att = off[p.matchedTo];
          if (!att) return null;
          const man = manTarget(att, defenseDistance);
          if (!man) return null;
          // Aide active (trigger) → trait plus marqué + couleur soutenue
          // Aide passive (sag baseline) → discret comme avant
          const triggered = !!p.helpTriggered;
          return (
            <line
              key={dId}
              x1={man.x}
              y1={man.y}
              x2={p.x}
              y2={p.y}
              stroke={triggered ? '#7c3aed' : '#534AB7'}
              strokeWidth={triggered ? 2.5 : 1.5}
              strokeDasharray={triggered ? '6 3' : '3 3'}
              opacity={triggered ? 0.9 : 0.55}
            />
          );
        }
      )}
    </g>
  );
}

interface ScreenIndicatorProps {
  screen: DetectedScreen | null;
  off: AttackerPositions;
  rule: ScreenRule;
}

export function ScreenIndicator({ screen, off, rule }: ScreenIndicatorProps) {
  if (!screen) return null;
  const sp = off[screen.screener];
  if (!sp) return null;
  return (
    <g pointerEvents="none">
      <circle cx={sp.x} cy={sp.y} r={28} fill="rgba(83, 74, 183, 0.10)" />
      <circle
        cx={sp.x}
        cy={sp.y}
        r={28}
        fill="none"
        stroke="#534AB7"
        strokeWidth={3}
        strokeDasharray="5 3"
        opacity={0.95}
      />
      <rect
        x={sp.x - 60}
        y={sp.y - 46}
        width={120}
        height={16}
        fill="rgba(255,255,255,0.92)"
        stroke="#534AB7"
        strokeWidth={1}
        rx={3}
      />
      <text
        x={sp.x}
        y={sp.y - 34}
        textAnchor="middle"
        fill="#534AB7"
        fontSize={11}
        fontWeight={600}
      >
        écran {screen.screener} → {screen.carrier} [{rule}]
      </text>
    </g>
  );
}

const ZONE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface ZoneOverlayProps {
  layout: ZoneLayout;
  show: boolean;
}

export function ZoneOverlay({ layout, show }: ZoneOverlayProps) {
  if (!show) return null;
  return (
    <g>
      {layout.map((zone, i) => {
        const points = zone.polygon.map((p) => `${p.x},${p.y}`).join(' ');
        const color = ZONE_COLORS[i % ZONE_COLORS.length];
        return (
          <g key={zone.id}>
            <polygon
              points={points}
              fill={color}
              fillOpacity={0.08}
              stroke={color}
              strokeOpacity={0.4}
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            <text
              x={zone.homePos.x}
              y={zone.homePos.y - 12}
              textAnchor="middle"
              fill={color}
              fontSize={10}
              fontWeight={500}
              opacity={0.7}
            >
              {zone.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface OffBallScreenIndicatorProps {
  screens: DetectedOffBallScreen[];
  off: AttackerPositions;
}

export function OffBallScreenIndicator({ screens, off }: OffBallScreenIndicatorProps) {
  if (screens.length === 0) return null;
  return (
    <g>
      {screens.map((s, i) => {
        const sp = off[s.screener];
        if (!sp) return null;
        return (
          <g key={i}>
            <circle
              cx={sp.x}
              cy={sp.y}
              r={26}
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              strokeDasharray="4 3"
              opacity={0.85}
            />
            <text
              x={sp.x}
              y={sp.y - 30}
              textAnchor="middle"
              fill="#16a34a"
              fontSize={10}
              fontWeight={500}
            >
              {s.type} {s.screener} → {s.cutter}
            </text>
          </g>
        );
      })}
    </g>
  );
}
