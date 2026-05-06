'use client';

import type { DefensiveMetrics } from '@/lib/logic/metrics';

interface MetricsBarProps {
  metrics: DefensiveMetrics;
}

export function MetricsBar({ metrics }: MetricsBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '6px 8px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        flexWrap: 'wrap',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      }}
    >
      <Pill
        label="raquette"
        value={`${metrics.paintCoverage}/5`}
        tone={metrics.paintCoverage >= 2 ? 'good' : metrics.paintCoverage === 0 ? 'bad' : 'warn'}
        title="Défenseurs à moins de 100px du panier"
      />
      <Pill
        label="gap max"
        value={`${metrics.maxGap}px`}
        tone={metrics.maxGap < 50 ? 'good' : metrics.maxGap < 100 ? 'warn' : 'bad'}
        title={
          metrics.mostFreeAttacker
            ? `Attaquant le plus libre : ${metrics.mostFreeAttacker} (${metrics.maxGap}px du défenseur le plus proche)`
            : 'Attaquant le plus libre'
        }
      />
      <Pill
        label="écart moy"
        value={`${metrics.avgDefenseDist}px`}
        tone="neutral"
        title="Écart moyen défenseur ↔ son attaquant marqué"
      />
      <Pill
        label="en retard"
        value={`${metrics.lateCount}`}
        tone={metrics.lateCount === 0 ? 'good' : metrics.lateCount === 1 ? 'warn' : 'bad'}
        title="Défenseurs n'ayant pas pu atteindre leur cible (rouge sur le terrain)"
      />
      <Pill
        label="aide"
        value={metrics.helpFactorTotal.toFixed(2)}
        tone="neutral"
        title="Somme des helpFactor (intensité d'aide globale)"
      />
      <Pill
        label="passes"
        value={`${metrics.openPasses}/${metrics.openPasses + metrics.contestedPasses + metrics.blockedPasses}`}
        tone={
          metrics.openPasses === 0 ? 'good' : metrics.openPasses >= 3 ? 'bad' : 'warn'
        }
        title={`Depuis le porteur : ${metrics.openPasses} ouvertes · ${metrics.contestedPasses} contestées · ${metrics.blockedPasses} bloquées`}
      />
    </div>
  );
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_STYLES: Record<Tone, { bg: string; fg: string; border: string }> = {
  good: { bg: '#d1fae5', fg: '#065f46', border: '#a7f3d0' },
  warn: { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  bad: { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
  neutral: { bg: '#f1f5f9', fg: '#334155', border: '#e2e8f0' },
};

function Pill({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone: Tone;
  title?: string;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 6,
        padding: '3px 8px',
        fontSize: 11,
        color: s.fg,
        cursor: title ? 'help' : 'default',
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}
