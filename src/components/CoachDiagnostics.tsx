'use client';

import type { CoachDiagnostic, CoachSeverity } from '@/lib/logic/coachDiagnostics';

interface CoachDiagnosticsProps {
  diagnostics: CoachDiagnostic[];
}

const SEVERITY_STYLES: Record<CoachSeverity, { bg: string; fg: string; border: string; icon: string }> = {
  good:     { bg: '#d1fae5', fg: '#065f46', border: '#a7f3d0', icon: '✓' },
  info:     { bg: '#dbeafe', fg: '#1e3a8a', border: '#bfdbfe', icon: 'ⓘ' },
  warning:  { bg: '#fef3c7', fg: '#92400e', border: '#fde68a', icon: '⚠' },
  critical: { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca', icon: '✕' },
};

const SEVERITY_RANK: Record<CoachSeverity, number> = {
  critical: 0, warning: 1, info: 2, good: 3,
};

/**
 * Bandeau de phrases coach sous la timeline. Trie par sévérité (critical > warning >
 * info > good) pour que les problèmes urgents soient visibles en premier.
 * Style dérivé de MetricsBar pour cohérence visuelle.
 */
export function CoachDiagnostics({ diagnostics }: CoachDiagnosticsProps) {
  if (diagnostics.length === 0) return null;
  const sorted = [...diagnostics].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '5px 6px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        flex: '0 0 auto',
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', opacity: 0.7 }}>
        LECTURE COACH
      </div>
      {sorted.map((d) => {
        const s = SEVERITY_STYLES[d.severity];
        return (
          <div
            key={d.id}
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
              {s.icon}
            </span>
            <span style={{ fontWeight: 500 }}>{d.message}</span>
          </div>
        );
      })}
    </div>
  );
}
