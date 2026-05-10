'use client';

import { useMemo } from 'react';
import type { AppState } from '@/lib/types';
import {
  computePlayerTracks,
  countRealSteps,
  ACTIVITY_COLORS,
  type PlayerTrack,
  type TrackSegment,
} from '@/lib/logic/playerTracks';

interface MultiTrackTimelineProps {
  state: AppState;
  /** t en espace full-step (0..totalSteps-1, incluant interpolés). Vient du
   *  scrubT / playbackT / activeStep du parent. */
  fullT: number;
  /** Hauteur disponible (par défaut 220 px = ~10 pistes de 20 px). */
  maxHeight?: number;
  onJumpToRealStep?: (realStepIdx: number) => void;
}

/**
 * Panneau multi-pistes "façon Premiere" : chaque joueur a sa ligne horizontale
 * couvrant toutes les étapes réelles. Curseur vertical synchronisé en temps
 * réel avec la lecture / le scrubbing.
 *
 * Lecture-seule pour V1 — l'édition drag des bornes (tStart/tEnd) viendra
 * dans une Étape 9 ultérieure (cf. docs/ideas.md).
 */
export function MultiTrackTimeline({ state, fullT, maxHeight = 240, onJumpToRealStep }: MultiTrackTimelineProps) {
  const tracks = useMemo(() => computePlayerTracks(state), [state]);
  const realStepsCount = useMemo(() => countRealSteps(state), [state]);

  // Mapping fullT → realT (position dans l'espace des étapes RÉELLES, sans interpolés).
  const realT = useMemo(() => fullTToRealT(state, fullT), [state, fullT]);

  if (tracks.length === 0 || realStepsCount < 2) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        Crée au moins 2 étapes pour voir les pistes par joueur.
      </div>
    );
  }

  const transitionCount = realStepsCount - 1;
  const cursorRatio = transitionCount > 0 ? realT / transitionCount : 0;
  const cursorPct = Math.max(0, Math.min(100, cursorRatio * 100));

  return (
    <div
      style={{
        background: '#fafbfc',
        borderTop: '1px solid #e2e8f0',
        maxHeight,
        overflowY: 'auto',
        padding: '8px 12px',
        position: 'relative',
      }}
    >
      {/* En-tête des colonnes (numéros de transition) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `52px repeat(${transitionCount}, 1fr)`,
        gap: 3,
        marginBottom: 4,
        fontSize: 9,
        color: '#94a3b8',
        fontWeight: 600,
        position: 'sticky',
        top: 0,
        background: '#fafbfc',
        zIndex: 2,
      }}>
        <div></div>
        {Array.from({ length: transitionCount }, (_, i) => (
          <div
            key={i}
            onClick={() => onJumpToRealStep?.(i + 1)}
            style={{ textAlign: 'center', cursor: 'pointer' }}
            title={`Sauter à l'étape ${i + 2}`}
          >
            #{i + 1}→#{i + 2}
          </div>
        ))}
      </div>

      {/* Pistes — attaquants puis défenseurs avec un petit gap */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
        {/* Curseur vertical synchronisé */}
        <div
          style={{
            position: 'absolute',
            left: `calc(52px + ((100% - 52px) * ${cursorPct / 100}))`,
            top: 0,
            bottom: 0,
            width: 2,
            background: '#D85A30',
            zIndex: 3,
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(216, 90, 48, 0.4)',
          }}
        />

        {tracks.filter((t) => t.kind === 'attacker').map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            transitionCount={transitionCount}
            onJumpToRealStep={onJumpToRealStep}
          />
        ))}
        <div style={{ height: 4, borderTop: '1px dashed #cbd5e1', margin: '2px 0' }} />
        {tracks.filter((t) => t.kind === 'defender').map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            transitionCount={transitionCount}
            onJumpToRealStep={onJumpToRealStep}
          />
        ))}
      </div>
    </div>
  );
}

function TrackRow({
  track,
  transitionCount,
  onJumpToRealStep,
}: {
  track: PlayerTrack;
  transitionCount: number;
  onJumpToRealStep?: (idx: number) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `52px repeat(${transitionCount}, 1fr)`,
      gap: 3,
      alignItems: 'center',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        background: track.kind === 'attacker' ? '#fed7aa' : '#bfdbfe',
        color: track.kind === 'attacker' ? '#9a3412' : '#1e3a8a',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 700,
        justifyContent: 'center',
      }}>
        {track.id}
      </div>
      {track.segments.slice(0, transitionCount).map((seg, i) => (
        <SegmentCell key={i} segment={seg} onClick={() => onJumpToRealStep?.(i + 1)} />
      ))}
    </div>
  );
}

function SegmentCell({ segment, onClick }: { segment: TrackSegment; onClick?: () => void }) {
  const color = ACTIVITY_COLORS[segment.activity];
  return (
    <div
      onClick={onClick}
      title={`${color.label}${segment.detail ? ' ' + segment.detail : ''}${segment.movePx > 0 ? ` · ${Math.round(segment.movePx)}px` : ''}`}
      style={{
        position: 'relative',
        padding: '2px 4px',
        background: color.bg,
        color: color.fg,
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 600,
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        height: 18,
        lineHeight: '14px',
      }}
    >
      {segment.isCarrier && (
        <span
          style={{
            position: 'absolute',
            top: 1,
            right: 1,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#ea580c',
          }}
        />
      )}
      {color.label}
      {segment.detail && (
        <span style={{ opacity: 0.7, marginLeft: 3 }}>{segment.detail}</span>
      )}
    </div>
  );
}

/**
 * Maps un fullT (espace de tous les steps, incluant interpolés) vers un realT
 * (espace des seuls steps "réels"). Pour positionner le curseur du multi-track
 * qui n'affiche que les transitions entre vrais steps.
 */
function fullTToRealT(state: AppState, fullT: number): number {
  const realIndices: number[] = [];
  state.steps.forEach((s, i) => { if (!s.isInterpolated) realIndices.push(i); });
  if (realIndices.length === 0) return 0;

  let iA = -1;
  let iB = -1;
  for (let i = 0; i < realIndices.length; i++) {
    if (realIndices[i] <= fullT) iA = i;
    if (realIndices[i] > fullT && iB === -1) iB = i;
  }
  if (iA === -1) return 0;
  if (iB === -1) return iA;
  const fullA = realIndices[iA];
  const fullB = realIndices[iB];
  const lerp = (fullT - fullA) / (fullB - fullA);
  return iA + lerp;
}
