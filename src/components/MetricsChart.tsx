'use client';

// Mini-graphique line chart sous la Timeline : évolution d'une métrique
// défensive (gap max / paint coverage / late count) au fil des étapes.
// SVG fait main, pas de lib de charting (overkill pour un mini-graphe).
//
// Performance : à chaque render, on appelle `effectiveDefensePositions` +
// `computeMetrics` pour CHAQUE step. Les deux sont pures + memoizées en
// amont (WeakMap cache sur l'AppState), donc OK tant que `state` est stable
// entre renders. Si lenteur ressentie, ajouter `useMemo` ici sur `[state]`.

import { useMemo, useState } from 'react';
import type { AppState } from '@/lib/types';
import { effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import { computeMetrics } from '@/lib/logic/metrics';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';

type MetricKey = 'maxGap' | 'paintCoverage' | 'lateCount' | 'helpFactorTotal';

interface MetricsChartProps {
  state: AppState;
  activeStep: number;
  /** Optionnel : permettre au parent de contrôler le step actif via clic. */
  onSetActiveStep?: (idx: number) => void;
}

const METRIC_LABELS: Record<MetricKey, { label: string; description: string; format: (v: number) => string }> = {
  maxGap: {
    label: 'gap max',
    description: "Distance au défenseur le plus proche pour l'attaquant le plus libre (px). Pic = danger.",
    format: (v) => `${Math.round(v)}px`,
  },
  paintCoverage: {
    label: 'raquette',
    description: 'Nombre de défenseurs à < 100px du panier. Pic = raquette protégée.',
    format: (v) => String(Math.round(v)),
  },
  lateCount: {
    label: 'late',
    description: "Nombre de défenseurs en retard (clamp vitesse). Pic = défense débordée.",
    format: (v) => String(Math.round(v)),
  },
  helpFactorTotal: {
    label: 'aide totale',
    description: "Somme des helpFactor (0-5). Pic = défense très engagée en aide.",
    format: (v) => v.toFixed(1),
  },
};

const CHART_HEIGHT = 70;
const CHART_PADDING = { top: 6, right: 8, bottom: 14, left: 8 };

export function MetricsChart({ state, activeStep, onSetActiveStep }: MetricsChartProps) {
  const [metric, setMetric] = useState<MetricKey>('maxGap');
  const [collapsed, setCollapsed] = useState(true);

  // Calcule la valeur de la métrique pour chaque step. Mémoizé sur l'identité
  // de `state` + `metric` (l'AppState change peu hors édition active).
  const series = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < state.steps.length; i++) {
      const step = state.steps[i];
      const off = activeOffense(step.off, state.playerCount);
      const carrier = activeBallCarrier(step, state.playerCount);
      const defPos = effectiveDefensePositions(state, i);
      const m = computeMetrics(off, defPos, carrier, getDefenseHoop(state));
      arr.push(m[metric]);
    }
    return arr;
  }, [state, metric]);

  if (state.steps.length < 2) return null; // pas pertinent sur 1 step

  if (collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button
          onClick={() => setCollapsed(false)}
          style={{
            fontSize: 10,
            padding: '3px 8px',
            border: '1px solid #cbd5e1',
            borderRadius: 4,
            background: '#fff',
            color: '#475569',
            cursor: 'pointer',
          }}
          title="Afficher l'évolution d'une métrique défensive au fil des étapes"
        >
          📈 graphique métrique
        </button>
      </div>
    );
  }

  // Dimensions du SVG : on s'étire à la largeur disponible via viewBox.
  const W = 600;
  const H = CHART_HEIGHT;
  const innerW = W - CHART_PADDING.left - CHART_PADDING.right;
  const innerH = H - CHART_PADDING.top - CHART_PADDING.bottom;

  const maxVal = Math.max(1, ...series); // évite division par 0
  const minVal = 0;
  const range = Math.max(1, maxVal - minVal);

  const x = (i: number) =>
    CHART_PADDING.left + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (v: number) => CHART_PADDING.top + innerH - ((v - minVal) / range) * innerH;

  const pathD = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div
      style={{
        marginTop: 6,
        padding: 6,
        background: '#fafafa',
        borderRadius: 6,
        border: '1px solid #e5e5e5',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>📈</span>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              title={METRIC_LABELS[k].description}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                border: `1px solid ${metric === k ? '#0284c7' : '#cbd5e1'}`,
                background: metric === k ? '#0284c7' : '#fff',
                color: metric === k ? '#fff' : '#475569',
                borderRadius: 3,
                cursor: 'pointer',
                fontWeight: metric === k ? 600 : 400,
              }}
            >
              {METRIC_LABELS[k].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            fontSize: 10,
            padding: '2px 6px',
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#475569',
            borderRadius: 3,
            cursor: 'pointer',
          }}
          title="Replier le graphique"
        >
          ✕
        </button>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: H, display: 'block' }}
      >
        {/* Ligne de base (zéro) */}
        <line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top + innerH}
          x2={CHART_PADDING.left + innerW}
          y2={CHART_PADDING.top + innerH}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
        {/* Path de la courbe */}
        <path
          d={pathD}
          stroke="#0284c7"
          strokeWidth={1.8}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Points par step (cliquables pour naviguer) */}
        {series.map((v, i) => {
          const cx = x(i);
          const cy = y(v);
          const isActive = i === activeStep;
          return (
            <g key={i}>
              {/* Cercle de hit-test plus large pour le clic */}
              <circle
                cx={cx}
                cy={cy}
                r={8}
                fill="transparent"
                style={{ cursor: onSetActiveStep ? 'pointer' : 'default' }}
                onClick={() => onSetActiveStep?.(i)}
              >
                <title>{`Étape ${i + 1} — ${METRIC_LABELS[metric].label}: ${METRIC_LABELS[metric].format(v)}`}</title>
              </circle>
              <circle
                cx={cx}
                cy={cy}
                r={isActive ? 3.5 : 2.5}
                fill={isActive ? '#dc2626' : '#0284c7'}
                pointerEvents="none"
              />
            </g>
          );
        })}
        {/* Marqueur vertical sur le step actif */}
        <line
          x1={x(activeStep)}
          y1={CHART_PADDING.top}
          x2={x(activeStep)}
          y2={CHART_PADDING.top + innerH}
          stroke="#dc2626"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.6}
          pointerEvents="none"
        />
        {/* Labels min/max sur l'axe Y (en haut/bas à gauche) */}
        <text
          x={CHART_PADDING.left + 2}
          y={CHART_PADDING.top + 7}
          fontSize={8}
          fill="#94a3b8"
        >
          {METRIC_LABELS[metric].format(maxVal)}
        </text>
        <text
          x={CHART_PADDING.left + 2}
          y={H - 2}
          fontSize={8}
          fill="#94a3b8"
        >
          0
        </text>
      </svg>
    </div>
  );
}
