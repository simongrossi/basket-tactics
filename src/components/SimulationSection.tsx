'use client';

import { useState } from 'react';
import type { AppState } from '@/lib/types';
import { Section, COLORS } from './ui';
import { effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import { simulatePossessions, type SimulationResult } from '@/lib/logic/simulator';

interface SimulationSectionProps {
  state: AppState;
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

/**
 * Phase C : panneau Simulation Monte Carlo. Lance N possessions
 * stochastiques depuis l'état courant et affiche les stats agrégées
 * (PPP, eFG%, distribution des outcomes).
 *
 * La défense est figée pendant la simulation — limite assumée du MVP.
 * Les softmax(EV/τ=0.3) gouvernent les décisions offensives.
 */
export function SimulationSection({ state }: SimulationSectionProps) {
  const c = COLORS.defense;
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);

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
        step.off,
        defPos,
        step.ballCarrier,
        runs,
        getDefenseHoop(state)
      );
      setResult(r);
      setRunning(false);
    }, 0);
  };

  return (
    <Section theme="defense" label="Simulation (Monte Carlo)">
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
