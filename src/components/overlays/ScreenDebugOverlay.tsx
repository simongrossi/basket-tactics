import type {
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  DetectedOffBallScreen,
  DetectedScreen,
  Point,
} from '@/lib/types';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import type { FrameDebug, FrameDecision } from '@/lib/logic/playback/frameResolver';
import { offBallScreeners } from '@/lib/logic/screenContext';

interface ScreenDebugOverlayProps {
  off: AttackerPositions;
  defPos: ComputedDefense;
  screen: DetectedScreen | null;
  offBallScreens: DetectedOffBallScreen[];
  debug?: FrameDebug;
}

export function ScreenDebugOverlay({
  off,
  defPos,
  screen,
  offBallScreens,
  debug,
}: ScreenDebugOverlayProps) {
  const decisions = Object.entries(debug?.defenders ?? {}) as [DefenderId, FrameDecision][];
  const activeDecisions = decisions.filter(([, d]) => isVisibleDecision(d));
  if (!screen && offBallScreens.length === 0 && activeDecisions.length === 0) return null;

  return (
    <g pointerEvents="none">
      {screen && off[screen.screener] && (
        <ScreenDebugRing
          key={`carrier-${screen.screener}`}
          pos={off[screen.screener]}
          color="#7c3aed"
          label={`P ${screen.screener}->${screen.carrier}`}
        />
      )}

      {offBallScreens.flatMap((s, i) =>
        offBallScreeners(s).map((entry, j) => {
          const pos = off[entry.screener] ?? entry.screenerPos;
          return (
            <ScreenDebugRing
              key={`off-${i}-${j}-${entry.screener}`}
              pos={pos}
              color="#16a34a"
              label={`${s.type.slice(0, 3)} ${entry.screener}->${s.cutter}`}
              dashed
            />
          );
        })
      )}

      {activeDecisions.map(([id, decision]) => {
        const d = defPos[id];
        if (!d) return null;
        const screener = decision.contactScreener ? off[decision.contactScreener] : undefined;
        const contact = screener ? contactPoint(d, screener) : undefined;
        const badge = badgePosition(d, id);
        const color = colorForDecision(decision);
        const mode = decision.screenMode ? decision.screenMode.toUpperCase() : 'ROUTE';
        const detail = `${decision.contactScreener ?? decision.clusterId ?? '-'} ${shortPush(decision)}`;

        return (
          <g key={id}>
            {screener && (
              <line
                x1={d.x}
                y1={d.y}
                x2={screener.x}
                y2={screener.y}
                stroke={color}
                strokeWidth={1.4}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            )}
            {contact && (
              <path
                d={`M ${contact.x} ${contact.y - 5} L ${contact.x + 5} ${contact.y} L ${contact.x} ${contact.y + 5} L ${contact.x - 5} ${contact.y} Z`}
                fill="#fff"
                stroke={color}
                strokeWidth={1.6}
              />
            )}
            <circle
              cx={d.x}
              cy={d.y}
              r={23}
              fill="none"
              stroke={color}
              strokeWidth={decision.locked ? 2.2 : 1.3}
              strokeDasharray={decision.locked ? undefined : '4 3'}
              opacity={0.9}
            />
            <rect
              x={badge.x - 43}
              y={badge.y - 13}
              width={86}
              height={28}
              fill="rgba(255,255,255,0.95)"
              stroke={color}
              strokeWidth={1}
              rx={3}
            />
            <text
              x={badge.x}
              y={badge.y - 2}
              textAnchor="middle"
              fill={color}
              fontSize={9.5}
              fontWeight={800}
            >
              {id} {mode} q{Math.round(decision.quality)}
            </text>
            <text
              x={badge.x}
              y={badge.y + 10}
              textAnchor="middle"
              fill="#334155"
              fontSize={8.5}
              fontWeight={650}
            >
              {detail}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ScreenDebugRing({
  pos,
  color,
  label,
  dashed = false,
}: {
  pos: Point;
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <g>
      <circle cx={pos.x} cy={pos.y} r={PLAYER_MIN_CLEARANCE_PX} fill={color} opacity={0.08} />
      <circle
        cx={pos.x}
        cy={pos.y}
        r={PLAYER_MIN_CLEARANCE_PX}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeDasharray={dashed ? '5 3' : undefined}
        opacity={0.9}
      />
      <rect
        x={pos.x - 42}
        y={pos.y + PLAYER_MIN_CLEARANCE_PX + 4}
        width={84}
        height={14}
        fill="rgba(255,255,255,0.93)"
        stroke={color}
        strokeWidth={0.8}
        rx={3}
      />
      <text
        x={pos.x}
        y={pos.y + PLAYER_MIN_CLEARANCE_PX + 15}
        textAnchor="middle"
        fill={color}
        fontSize={8.5}
        fontWeight={750}
      >
        {label}
      </text>
    </g>
  );
}

function isVisibleDecision(decision: FrameDecision): boolean {
  return !!decision.screenMode ||
    decision.curveBranch !== 'none' ||
    decision.pushMode !== 'skipped' ||
    decision.locked;
}

function colorForDecision(decision: FrameDecision): string {
  if (decision.pushMode === 'constrained') return '#ef4444';
  if (decision.screenMode === 'stuck') return '#dc2626';
  if (decision.screenMode === 'arriving') return '#f97316';
  if (decision.screenMode === 'leaving') return '#2563eb';
  if (decision.contactKind === 'off-ball') return '#16a34a';
  return '#64748b';
}

function shortPush(decision: FrameDecision): string {
  if (decision.pushMode === 'constrained') return 'push:C';
  if (decision.pushMode === 'naive') return 'push:N';
  if (decision.locked) return 'lock';
  return decision.curveBranch === 'staggered-pair' ? 'pair' : decision.curveBranch;
}

function badgePosition(p: Point, id: DefenderId): Point {
  const idx = Number(id.slice(1)) || 1;
  const sign = idx % 2 === 0 ? 1 : -1;
  return { x: p.x + sign * 42, y: p.y - 30 };
}

function contactPoint(defender: Point, screener: Point): Point {
  const dx = defender.x - screener.x;
  const dy = defender.y - screener.y;
  const len = Math.hypot(dx, dy) || 1;
  const clearance = PLAYER_MIN_CLEARANCE_PX + 1;
  return {
    x: screener.x + (dx / len) * clearance,
    y: screener.y + (dy / len) * clearance,
  };
}
