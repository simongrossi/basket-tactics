import type { DefenderId } from '@/lib/types';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';

interface ScreenPlayerDebugPanelProps {
  frame: PlaybackFrame;
  selectedDefenders: Set<DefenderId>;
}

export function ScreenPlayerDebugPanel({
  frame,
  selectedDefenders,
}: ScreenPlayerDebugPanelProps) {
  if (selectedDefenders.size === 0) return null;

  const defenders = Array.from(selectedDefenders).filter((id) => frame.defPos[id]);
  if (defenders.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        bottom: 14,
        width: 280,
        maxWidth: 'calc(100% - 28px)',
        background: 'rgba(15, 23, 42, 0.94)',
        color: '#e2e8f0',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 11,
        lineHeight: 1.25,
        pointerEvents: 'none',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.24)',
      }}
    >
      <div style={{ fontWeight: 800, color: '#fff', marginBottom: 6 }}>
        Debug écran
      </div>
      {defenders.map((id) => {
        const decision = frame.debug?.defenders[id];
        const def = frame.defPos[id];
        const screeners = decision?.contactScreeners?.length
          ? decision.contactScreeners.join('+')
          : decision?.contactScreener ?? '-';
        const inertia = decision?.motionInertia !== undefined
          ? `${Math.round(decision.motionInertia * 100)}% / ${Math.round(decision.motionTurnDeg ?? 0)}deg`
          : '-';
        return (
          <div
            key={id}
            style={{
              borderTop: '1px solid rgba(148, 163, 184, 0.22)',
              paddingTop: 6,
              marginTop: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ color: '#fff' }}>{id}</strong>
              <span>{decision?.screenState ?? def.screenPhase ?? 'idle'}</span>
            </div>
            <DebugRows
              rows={[
                ['contact', decision?.contactKey ?? '-'],
                ['mode', decision?.screenMode ?? '-'],
                ['route', decision?.routeKind ?? '-'],
                ['poseurs', screeners],
                ['actif', decision?.activeScreener ?? decision?.contactScreener ?? '-'],
                ['qualité', decision ? String(Math.round(decision.quality)) : '-'],
                ['mémoire', decision?.memoryUsed ? 'oui' : 'non'],
                ['inertie', inertia],
                ['push', decision?.pushMode ?? '-'],
                ['cluster', decision?.clusterId ?? '-'],
                ['jump', decision?.lastJumpPx !== undefined ? `${decision.lastJumpPx.toFixed(1)}px` : '-'],
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}

function DebugRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: '2px 8px', marginTop: 4 }}>
      {rows.map(([label, value]) => (
        <Row key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span
        style={{
          color: '#f8fafc',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </>
  );
}
