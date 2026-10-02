'use client';

import { formatDistance } from '@/lib/logic/displayUnits';
import { useInterfaceLevel } from './interface/InterfaceLevel';
import type { DefensiveMetrics } from '@/lib/logic/metrics';
import type { OffensiveAction } from '@/lib/logic/offense';
import type { DetectedScreenAction } from '@/lib/logic/screenAction';
import { screenActionLabel } from '@/lib/logic/screenAction';

interface MetricsBarProps {
  metrics: DefensiveMetrics;
  playerCount?: number;
  /** Meilleure action offensive (Phase B). Affichée comme pill à droite. */
  bestAction?: OffensiveAction | null;
  /** Action PnR détectée à l'étape courante (P0). Pill informative entre
   *  les métriques et la meilleure action. */
  screenAction?: DetectedScreenAction | null;
}

const ACTION_LABELS: Record<OffensiveAction['type'], string> = {
  shoot: 'tir',
  drive: 'drive',
  'pass-shoot': 'passe',
};

const BAR_UI = {
  bg: 'var(--bt-surface)',
  border: 'var(--bt-border-strong)',
  textDim: 'var(--bt-text-dim)',
} as const;

export function MetricsBar({ metrics, bestAction, screenAction, playerCount = 5 }: MetricsBarProps) {
  const { analysis } = useInterfaceLevel();
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '4px 6px',
        background: BAR_UI.bg,
        border: `1px solid ${BAR_UI.border}`,
        borderRadius: 7,
        flexWrap: 'wrap',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        flex: '0 0 auto',
      }}
    >
      <Pill
        label="raquette"
        value={`${metrics.paintCoverage}/${playerCount}`}
        tone={metrics.paintCoverage >= 2 ? 'good' : metrics.paintCoverage === 0 ? 'bad' : 'warn'}
        title={`Défenseurs à moins de ${formatDistance(100)} du panier`}
      />
      <Pill
        label="écart max"
        value={formatDistance(metrics.maxGap)}
        tone={metrics.maxGap < 50 ? 'good' : metrics.maxGap < 100 ? 'warn' : 'bad'}
        title={
          metrics.mostFreeAttacker
            ? `Attaquant le plus libre : ${metrics.mostFreeAttacker} (${formatDistance(metrics.maxGap)} du défenseur le plus proche)`
            : 'Attaquant le plus libre'
        }
      />
      <Pill
        label="écart moy"
        value={formatDistance(metrics.avgDefenseDist)}
        tone="neutral"
        title="Écart moyen défenseur ↔ son attaquant marqué"
      />
      <Pill
        label="en retard"
        value={`${metrics.lateCount}`}
        tone={metrics.lateCount === 0 ? 'good' : metrics.lateCount === 1 ? 'warn' : 'bad'}
        title="Défenseurs n'ayant pas pu atteindre leur cible (rouge sur le terrain)"
      />
      {analysis && (
      <Pill
        label="aide"
        value={metrics.helpFactorTotal.toFixed(2)}
        tone="neutral"
        title="Somme des helpFactor (intensité d'aide globale)"
      />
      )}
      <Pill
        label="passes"
        value={`${metrics.openPasses}/${metrics.openPasses + metrics.contestedPasses + metrics.blockedPasses}`}
        tone={
          metrics.openPasses === 0 ? 'good' : metrics.openPasses >= 3 ? 'bad' : 'warn'
        }
        title={`Depuis le porteur : ${metrics.openPasses} ouvertes · ${metrics.contestedPasses} contestées · ${metrics.blockedPasses} bloquées`}
      />
      {screenAction && (
        <Pill
          label="action PnR"
          value={screenActionLabel(screenAction.kind)}
          tone={
            screenAction.kind === 'reject' || screenAction.kind === 'snake' ? 'warn' :
            screenAction.kind === 're-screen' ? 'neutral' :
            screenAction.confidence >= 0.7 ? 'good' : 'neutral'
          }
          title={`${screenAction.reason} · confiance ${Math.round(screenAction.confidence * 100)}%`}
        />
      )}
      {analysis && bestAction && (
        <Pill
          label="meilleure action"
          value={`${ACTION_LABELS[bestAction.type]}${bestAction.targetId ? ' ' + bestAction.targetId : ''} · ${bestAction.expectedPoints.toFixed(2)} pts`}
          tone={bestAction.expectedPoints >= 1.2 ? 'bad' : bestAction.expectedPoints >= 0.7 ? 'warn' : 'good'}
          title={`EV = succès ${Math.round(bestAction.successRate * 100)}% × FG% ${Math.round(bestAction.scoreProbability * 100)}% × ${bestAction.shotPoints} pts. Activez 'meilleure action' dans Visu/Légende pour voir la flèche dorée sur le terrain.`}
        />
      )}
    </div>
  );
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_STYLES: Record<Tone, { bg: string; fg: string; border: string }> = {
  good: { bg: 'rgba(52, 211, 153, 0.14)', fg: 'var(--bt-green-text)', border: 'rgba(52, 211, 153, 0.26)' },
  warn: { bg: 'rgba(251, 191, 36, 0.14)', fg: 'var(--bt-amber-text)', border: 'rgba(251, 191, 36, 0.25)' },
  bad: { bg: 'rgba(248, 113, 113, 0.14)', fg: 'var(--bt-red-text)', border: 'rgba(248, 113, 113, 0.28)' },
  neutral: { bg: 'var(--bt-surface)', fg: 'var(--bt-text-muted)', border: 'var(--bt-border-strong)' },
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
        gap: 4,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 5,
        padding: '2px 6px',
        fontSize: 10,
        color: s.fg,
        cursor: title ? 'help' : 'default',
        lineHeight: 1.4,
        fontWeight: 600,
      }}
    >
      <span style={{ color: BAR_UI.textDim }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}
