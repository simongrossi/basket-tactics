'use client';

import { useState } from 'react';
import type { AppState, Step } from '@/lib/types';
import { Section, COLORS } from './ui';
import { effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import { simulatePossessions, type SimulationResult } from '@/lib/logic/simulator';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import {
  generateAiMatchSeries,
  type AiMatchSeries,
  type AiPossessionOutcome,
} from '@/lib/logic/match/aiPossession';
import { useMatchLoop } from '@/hooks/useMatchLoop';

interface SimulationSectionProps {
  state: AppState;
  onLoadAiSteps?: (steps: Step[], startStepIndex: number) => void;
}

const PRESET_RUNS = [50, 200, 1000];

const OUTCOME_LABELS: Record<keyof SimulationResult['outcomes'], string> = {
  'shot-made': 'tirs réussis',
  'shot-missed': 'tirs manqués',
  'turnover-pass': 'pertes (passe)',
  'turnover-drive': 'pertes (drive)',
  'forced-shot-made': 'tirs forcés réussis',
  'forced-shot-missed': 'tirs forcés manqués',
};

const AI_OUTCOME_LABELS: Record<AiPossessionOutcome, string> = {
  'shot-made': 'tir marqué',
  'shot-missed': 'tir raté',
  'turnover-pass': 'perte passe',
  'turnover-drive': 'perte drive',
  'forced-shot-made': 'tir forcé marqué',
  'forced-shot-missed': 'tir forcé raté',
  empty: 'sans action',
};

/**
 * Phase C : panneau Simulation Monte Carlo. Lance N possessions
 * stochastiques depuis l'état courant et affiche les stats agrégées
 * (PPP, eFG%, distribution des outcomes).
 *
 * La défense est figée pendant la simulation — limite assumée du MVP.
 * Les softmax(EV/τ=0.3) gouvernent les décisions offensives.
 */
export function SimulationSection({ state, onLoadAiSteps }: SimulationSectionProps) {
  const c = COLORS.defense;
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [aiSeries, setAiSeries] = useState<AiMatchSeries | null>(null);
  const [running, setRunning] = useState(false);
  const [runningAi, setRunningAi] = useState(false);

  const runSimulation = (runs: number) => {
    setRunning(true);
    // setTimeout pour libérer le thread UI le temps que le bouton "loading"
    // s'affiche. Pour 1000 runs c'est typiquement 50-200ms.
    setTimeout(() => {
      const step = state.steps[state.activeStep];
      if (!step) {
        setRunning(false);
        return;
      }
      const defPos = effectiveDefensePositions(state, state.activeStep);
      const r = simulatePossessions(
        activeOffense(step.off, state.playerCount),
        defPos,
        activeBallCarrier(step, state.playerCount),
        runs,
        getDefenseHoop(state)
      );
      setResult(r);
      setRunning(false);
    }, 0);
  };

  const runAiMode = () => {
    setRunningAi(true);
    setTimeout(() => {
      const series = generateAiMatchSeries(state, {
        possessions: 3,
        seed: Date.now(),
        creativity: 0.42,
      });
      setAiSeries(series);
      setRunningAi(false);
    }, 0);
  };

  return (
    <Section theme="defense" label="Simulation & IA">
      <div style={{ fontSize: 11, fontWeight: 700, color: c.accentText, marginBottom: 4 }}>
        Mode IA possession
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Génère plusieurs possessions depuis l'état courant, puis charge une possession dans la timeline.
      </div>
      <button
        type="button"
        onClick={runAiMode}
        disabled={runningAi}
        style={{
          width: '100%',
          fontSize: 11,
          padding: '6px 0',
          borderRadius: 4,
          border: `1px solid ${c.border}`,
          background: runningAi ? '#f1f5f9' : '#eef2ff',
          color: runningAi ? '#94a3b8' : '#3730a3',
          cursor: runningAi ? 'wait' : 'pointer',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        ▶ générer 3 possessions IA
      </button>
      {runningAi && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
          IA en lecture…
        </div>
      )}
      {aiSeries && !runningAi && (
        <AiSeriesStats
          series={aiSeries}
          onLoadAiSteps={onLoadAiSteps}
        />
      )}

      <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0 8px' }} />
      <LiveMatchPanel state={state} />

      <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0 8px' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: c.accentText, marginBottom: 4 }}>
        Monte Carlo
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Lance N possessions stochastiques sur l'état courant. La défense est figée pendant la sim.
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {PRESET_RUNS.map((n) => (
          <button
            key={n}
            onClick={() => runSimulation(n)}
            disabled={running}
            style={{
              flex: 1,
              fontSize: 11,
              padding: '5px 0',
              borderRadius: 4,
              border: `1px solid ${c.border}`,
              background: running ? '#f1f5f9' : '#fff',
              color: running ? '#94a3b8' : c.accentText,
              cursor: running ? 'wait' : 'pointer',
              fontWeight: 500,
            }}
          >
            ▶ {n} runs
          </button>
        ))}
      </div>
      {result && !running && <SimulationStats result={result} />}
      {running && (
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
          Simulation en cours…
        </div>
      )}
    </Section>
  );
}

function AiSeriesStats({
  series,
  onLoadAiSteps,
}: {
  series: AiMatchSeries;
  onLoadAiSteps?: (steps: Step[], startStepIndex: number) => void;
}) {
  const pppColor = series.summary.ppp >= 1.1 ? '#dc2626' : series.summary.ppp >= 0.85 ? '#d97706' : '#16a34a';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="PPP IA" value={series.summary.ppp.toFixed(2)} color={pppColor} />
        <Stat label="pts" value={String(series.summary.totalPoints)} color="#475569" />
        <Stat label="pertes" value={String(series.summary.turnovers)} color="#dc2626" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {series.plans.map((plan) => (
          <div
            key={`${plan.possession}-${plan.seed}`}
            style={{
              padding: '6px',
              border: '1px solid #e2e8f0',
              borderRadius: 5,
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>
                  P{plan.possession} · {AI_OUTCOME_LABELS[plan.outcome]} · {plan.points} pt
                </div>
                <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {plan.events.map((e) => e.label).join(' · ') || 'Aucune décision'}
                </div>
              </div>
              {onLoadAiSteps && (
                <button
                  type="button"
                  onClick={() => onLoadAiSteps(plan.steps, plan.generatedStartIndex)}
                  title="Charge cette possession dans la timeline pour la lire sur le terrain."
                  style={{
                    fontSize: 10,
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: '1px solid #c7d2fe',
                    background: '#fff',
                    color: '#3730a3',
                    cursor: 'pointer',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  charger
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimulationStats({ result }: { result: SimulationResult }) {
  const pppColor = result.ppp >= 1.1 ? '#dc2626' : result.ppp >= 0.85 ? '#d97706' : '#16a34a';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Ligne PPP + eFG en grande typographie */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="PPP" value={result.ppp.toFixed(2)} color={pppColor} />
        <Stat
          label="eFG%"
          value={`${Math.round(result.efgPct * 100)}%`}
          color={result.efgPct >= 0.55 ? '#dc2626' : result.efgPct >= 0.45 ? '#d97706' : '#16a34a'}
        />
        <Stat
          label="score"
          value={`${Math.round(result.scoreRate * 100)}%`}
          color="#475569"
        />
      </div>
      {/* Distribution des outcomes */}
      <div style={{ fontSize: 10, color: '#475569' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Distribution ({result.runs} possessions)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(Object.keys(OUTCOME_LABELS) as Array<keyof SimulationResult['outcomes']>).map((k) => {
            const count = result.outcomes[k];
            if (count === 0) return null;
            const pct = (count / result.runs) * 100;
            const isMade = k.includes('made');
            const isTO = k.includes('turnover');
            const color = isMade ? '#16a34a' : isTO ? '#dc2626' : '#94a3b8';
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 4, height: 10, background: color, borderRadius: 1 }} />
                <span style={{ flex: 1 }}>{OUTCOME_LABELS[k]}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
                <span style={{ width: 38, textAlign: 'right', color: '#94a3b8' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Phase I B1 — Panneau "▶ Play IA (live)". MVP minimal :
 *  - bouton démarrage
 *  - countdown shot clock
 *  - score live + outcome final quand la possession se termine
 *  - pause / reprise / stop
 *
 *  Le terrain affiché côté CourtView N'EST PAS encore synchronisé avec le
 *  matchState live (livré en B4 = UI complète). En attendant, ce panneau
 *  permet déjà de valider que le tick produit des outcomes cohérents. */
function LiveMatchPanel({ state }: { state: AppState }) {
  const { matchState, isRunning, start, pause, resume, stop } = useMatchLoop({
    baseState: state,
  });

  const shotClockSec = matchState ? Math.max(0, matchState.shotClockMs / 1000) : 24;
  const shotClockColor =
    shotClockSec <= 4 ? '#dc2626' : shotClockSec <= 8 ? '#d97706' : '#16a34a';

  const outcomeLabel = matchState?.outcome ? AI_OUTCOME_LABELS[matchState.outcome] : null;
  const isFinished = matchState?.outcome != null;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
        Play IA (live)
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, lineHeight: 1.4 }}>
        Lance une possession simulée tick par tick (5 Hz). MVP B1 — le terrain n'est pas encore
        synchronisé (B4) ; on observe le shot clock + outcome.
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {!matchState && (
          <button
            type="button"
            onClick={() => start()}
            style={liveButtonStyle('start')}
          >
            ▶ démarrer
          </button>
        )}
        {matchState && isRunning && !isFinished && (
          <button type="button" onClick={pause} style={liveButtonStyle('pause')}>
            ⏸ pause
          </button>
        )}
        {matchState && !isRunning && !isFinished && (
          <button type="button" onClick={resume} style={liveButtonStyle('start')}>
            ▶ reprendre
          </button>
        )}
        {matchState && (
          <button type="button" onClick={stop} style={liveButtonStyle('stop')}>
            ⏹ stop
          </button>
        )}
      </div>

      {matchState && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '6px 8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 5,
            fontSize: 11,
            color: '#1e293b',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>shot clock</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: shotClockColor, lineHeight: 1.1 }}>
              {shotClockSec.toFixed(1)}
              <span style={{ fontSize: 10, color: '#94a3b8' }}> s</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>score</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.1 }}>
              +{matchState.score}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>porteur</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7c2d12', lineHeight: 1.1 }}>
              {matchState.carrier}
            </div>
          </div>
        </div>
      )}

      {isFinished && outcomeLabel && (
        <div
          style={{
            marginTop: 6,
            padding: '5px 8px',
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            borderRadius: 5,
            fontSize: 11,
            color: '#3730a3',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          {outcomeLabel} · {matchState!.tickCount} ticks · {(matchState!.possessionTimeMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

function liveButtonStyle(kind: 'start' | 'pause' | 'stop') {
  const palette = {
    start: { bg: '#eef2ff', border: '#4338ca', color: '#3730a3' },
    pause: { bg: '#fef3c7', border: '#d97706', color: '#92400e' },
    stop: { bg: '#fee2e2', border: '#dc2626', color: '#991b1b' },
  }[kind];
  return {
    flex: 1,
    fontSize: 11,
    padding: '5px 8px',
    borderRadius: 4,
    border: `1px solid ${palette.border}`,
    background: palette.bg,
    color: palette.color,
    cursor: 'pointer' as const,
    fontWeight: 600,
  };
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '6px 4px',
        borderRadius: 5,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
