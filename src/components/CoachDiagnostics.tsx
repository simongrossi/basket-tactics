'use client';

import type { CoachDiagnostic, CoachSeverity } from '@/lib/logic/coachDiagnostics';

interface CoachDiagnosticsProps {
  diagnostics: CoachDiagnostic[];
}

const SEVERITY_STYLES: Record<CoachSeverity, { bg: string; fg: string; border: string; icon: string }> = {
  good:     { bg: 'rgba(52, 211, 153, 0.14)', fg: '#6ee7b7', border: 'rgba(52, 211, 153, 0.26)', icon: '✓' },
  info:     { bg: 'rgba(96, 165, 250, 0.15)', fg: '#93c5fd', border: 'rgba(96, 165, 250, 0.28)', icon: 'ⓘ' },
  warning:  { bg: 'rgba(251, 191, 36, 0.14)', fg: '#fbbf24', border: 'rgba(251, 191, 36, 0.25)', icon: '⚠' },
  critical: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#fca5a5', border: 'rgba(248, 113, 113, 0.28)', icon: '✕' },
};

const SEVERITY_RANK: Record<CoachSeverity, number> = {
  critical: 0, warning: 1, info: 2, good: 3,
};

/**
 * Bandeau de phrases coach sous la timeline. Sépare en deux blocs :
 *  1. CRITIQUE DÉFENSE — diagnostics taggés non-`read-*`, triés par sévérité.
 *  2. LECTURE OFFENSIVE — diagnostics taggés `read-*` (les opportunités).
 * Permet au coach de voir d'un coup d'œil "ce qui ne va pas" vs "ce qu'on
 * peut exploiter". Style dérivé de MetricsBar pour cohérence visuelle.
 */
export function CoachDiagnostics({ diagnostics }: CoachDiagnosticsProps) {
  if (diagnostics.length === 0) return null;
  const defenseDiags = diagnostics.filter((d) => !d.tag.startsWith('read-'));
  const readDiags = diagnostics.filter((d) => d.tag.startsWith('read-'));
  const sortedDefense = [...defenseDiags].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
  const sortedReads = [...readDiags].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '5px 6px',
        background: '#20252d',
        border: '1px solid #343b47',
        borderRadius: 7,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        flex: '0 0 auto',
      }}
    >
      {sortedDefense.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>
            LECTURE COACH
          </div>
          {sortedDefense.map((d) => (
            <DiagnosticRow key={d.id} d={d} />
          ))}
        </>
      )}
      {sortedReads.length > 0 && (
        <>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#94a3b8',
              letterSpacing: '0.06em',
              marginTop: sortedDefense.length > 0 ? 4 : 0,
            }}
          >
            LECTURE OFFENSIVE
          </div>
          {sortedReads.map((d) => (
            <DiagnosticRow key={d.id} d={d} isRead />
          ))}
        </>
      )}
    </div>
  );
}

function DiagnosticRow({ d, isRead }: { d: CoachDiagnostic; isRead?: boolean }) {
  const s = SEVERITY_STYLES[d.severity];
  return (
    <div
      title={d.tag}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 4,
        padding: '3px 6px',
        fontSize: 11,
        color: s.fg,
        lineHeight: 1.35,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 10, width: 12, textAlign: 'center', flex: '0 0 12px' }}>
        {isRead ? '→' : s.icon}
      </span>
      <span style={{ fontWeight: 500 }}>
        {/* Pour les reads, on retire la flèche déjà préfixée dans le message
            pour éviter le doublon "→ → ...". */}
        {isRead && d.message.startsWith('→ ') ? d.message.slice(2) : d.message}
      </span>
    </div>
  );
}
