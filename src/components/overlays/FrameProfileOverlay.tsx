// J.5 V1 — Overlay de profiling live.
//
// Affiche dans le coin haut-gauche du terrain un panneau qui agrège
// les FrameProfile reçus sur les N dernières frames du playback.
// Stats par phase : mean / max / p95. La phase la plus coûteuse est
// mise en évidence (hottestPhase).
//
// Activation : state.showProfileOverlay = true (toggle ParametresPanel).
// Active aussi `profile: true` dans useCourtFrame.

import { useEffect, useRef, useState } from 'react';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';
import {
  aggregateProfiles,
  ProfileRingBuffer,
  type AggregatedProfile,
} from '@/lib/logic/playback/profileAggregator';

interface FrameProfileOverlayProps {
  frame: PlaybackFrame | null;
  visible?: boolean;
  /** Taille du buffer glissant (défaut 120 = 2s à 60fps). */
  bufferSize?: number;
}

const PHASE_LABELS: Record<string, string> = {
  attackers: 'attackers',
  screens: 'screens',
  obstacles: 'obstacles',
  defenders: 'defenders',
  collisions: 'collisions',
  rateLimiter: 'rateLim',
  ball: 'ball',
};

/** Couleur du badge selon le poids relatif d'une phase dans le total. */
function phaseColor(mean: number, total: number): string {
  if (total <= 0.0001) return '#475569';
  const ratio = mean / total;
  if (ratio > 0.35) return '#fca5a5';   // rouge — dominante
  if (ratio > 0.15) return '#fbbf24';   // jaune
  return '#86efac';                      // vert
}

export function FrameProfileOverlay({ frame, visible = true, bufferSize = 120 }: FrameProfileOverlayProps) {
  const bufferRef = useRef(new ProfileRingBuffer(bufferSize));
  const [agg, setAgg] = useState<AggregatedProfile | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (!frame?.profile) return;
    bufferRef.current.push(frame.profile);
    // Re-aggrégate à chaque frame entrante. Coût O(N×P), N=120, P=7 → ok.
    setAgg(aggregateProfiles(bufferRef.current.snapshot()));
  }, [frame, visible]);

  if (!visible) return null;

  const total = agg?.total ?? { mean: 0, max: 0, p95: 0, sum: 0 };
  const phaseEntries = agg
    ? Object.entries(agg.byPhase).sort(
        ([, a], [, b]) => b.mean - a.mean,
      )
    : [];

  return (
    <div
      style={{
        position: 'absolute',
        left: 14,
        top: 14,
        width: 220,
        maxWidth: 'calc(100% - 28px)',
        background: 'rgba(15, 23, 42, 0.94)',
        color: '#e2e8f0',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'none',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.24)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={{ fontWeight: 800, color: '#fff', marginBottom: 6, fontSize: 11 }}>
        ⚡ Profile (J.5) · {agg?.count ?? 0} frames
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 1fr', gap: '2px 6px' }}>
        <HeaderCell>phase</HeaderCell>
        <HeaderCell align="right">mean</HeaderCell>
        <HeaderCell align="right">p95</HeaderCell>
        <HeaderCell align="right">max</HeaderCell>

        <span style={{ color: '#fff', fontWeight: 700 }}>total</span>
        <ValueCell ms={total.mean} color="#cbd5e1" />
        <ValueCell ms={total.p95} color="#cbd5e1" />
        <ValueCell ms={total.max} color="#cbd5e1" />

        {phaseEntries.map(([name, stats]) => {
          const isHottest = agg?.hottestPhase === name;
          return (
            <Row
              key={name}
              name={PHASE_LABELS[name] ?? name}
              stats={stats}
              total={total.mean}
              isHottest={isHottest}
            />
          );
        })}
      </div>
      {agg && agg.count > 0 && (
        <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 9 }}>
          budget 16.67ms / frame (60fps)
        </div>
      )}
      {!frame?.profile && (
        <div style={{ marginTop: 6, color: '#fbbf24', fontSize: 9 }}>
          ⚠ pas de profile reçu — lancer la lecture
        </div>
      )}
    </div>
  );
}

function HeaderCell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <span
      style={{
        color: '#94a3b8', fontWeight: 700, fontSize: 9, textTransform: 'uppercase',
        textAlign: align,
      }}
    >
      {children}
    </span>
  );
}

function ValueCell({ ms, color }: { ms: number; color: string }) {
  return <span style={{ color, textAlign: 'right' }}>{ms.toFixed(2)}</span>;
}

function Row({
  name, stats, total, isHottest,
}: {
  name: string;
  stats: { mean: number; max: number; p95: number; sum: number };
  total: number;
  isHottest: boolean;
}) {
  const color = phaseColor(stats.mean, total);
  return (
    <>
      <span style={{ color, fontWeight: isHottest ? 700 : 500 }}>
        {isHottest && '🔥 '}
        {name}
      </span>
      <ValueCell ms={stats.mean} color={color} />
      <ValueCell ms={stats.p95} color={color} />
      <ValueCell ms={stats.max} color={color} />
    </>
  );
}
