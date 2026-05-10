'use client';

import { useMemo, useRef, useState } from 'react';
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
  /** Bascule la phase d'une annotation entre 'start' et 'end'. */
  onTogglePhase?: (stepFullIdx: number, annoIdx: number, newPhase: 'start' | 'end') => void;
  /** Édite les bornes temporelles d'une annotation (drag des poignées). */
  onTrimTiming?: (stepFullIdx: number, annoIdx: number, tStart: number, tEnd: number) => void;
}

/**
 * Panneau multi-pistes "façon Premiere" : chaque joueur a sa ligne horizontale
 * couvrant toutes les étapes réelles. Curseur vertical synchronisé en temps
 * réel avec la lecture / le scrubbing.
 *
 * Lecture-seule pour V1 — l'édition drag des bornes (tStart/tEnd) viendra
 * dans une Étape 9 ultérieure (cf. docs/ideas.md).
 */
export function MultiTrackTimeline({
  state,
  fullT,
  maxHeight = 240,
  onJumpToRealStep,
  onTogglePhase,
  onTrimTiming,
}: MultiTrackTimelineProps) {
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
            onTogglePhase={onTogglePhase}
            onTrimTiming={onTrimTiming}
          />
        ))}
        <div style={{ height: 4, borderTop: '1px dashed #cbd5e1', margin: '2px 0' }} />
        {tracks.filter((t) => t.kind === 'defender').map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            transitionCount={transitionCount}
            onJumpToRealStep={onJumpToRealStep}
            onTogglePhase={onTogglePhase}
            onTrimTiming={onTrimTiming}
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
  onTogglePhase,
  onTrimTiming,
}: {
  track: PlayerTrack;
  transitionCount: number;
  onJumpToRealStep?: (idx: number) => void;
  onTogglePhase?: (stepFullIdx: number, annoIdx: number, newPhase: 'start' | 'end') => void;
  onTrimTiming?: (stepFullIdx: number, annoIdx: number, tStart: number, tEnd: number) => void;
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
        <SegmentCell
          key={i}
          segment={seg}
          onClick={() => onJumpToRealStep?.(i + 1)}
          onTogglePhase={onTogglePhase}
          onTrimTiming={onTrimTiming}
        />
      ))}
    </div>
  );
}

function SegmentCell({
  segment,
  onClick,
  onTogglePhase,
  onTrimTiming,
}: {
  segment: TrackSegment;
  onClick?: () => void;
  onTogglePhase?: (stepFullIdx: number, annoIdx: number, newPhase: 'start' | 'end') => void;
  onTrimTiming?: (stepFullIdx: number, annoIdx: number, tStart: number, tEnd: number) => void;
}) {
  const color = ACTIVITY_COLORS[segment.activity];
  const isMovementWithAnno =
    (segment.activity === 'cut' || segment.activity === 'screen' || segment.activity === 'dribble') &&
    segment.annoStepFullIdx !== undefined &&
    segment.annoIdx !== undefined;
  const phase = segment.phase ?? 'end';
  const tStart = isMovementWithAnno ? (segment.tStart ?? 0) : 0;
  const tEnd = isMovementWithAnno ? (segment.tEnd ?? 1) : 1;

  const cellRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  const handleTogglePhase = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMovementWithAnno || !onTogglePhase) return;
    onTogglePhase(segment.annoStepFullIdx!, segment.annoIdx!, phase === 'start' ? 'end' : 'start');
  };

  const handleHandlePointerDown =
    (which: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isMovementWithAnno || !onTrimTiming) return;
      e.stopPropagation();
      e.preventDefault();
      setDragging(which);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !cellRef.current || !onTrimTiming || !isMovementWithAnno) return;
    const rect = cellRef.current.getBoundingClientRect();
    // On laisse le ratio sortir de [0, 1] pour permettre l'extension dans les
    // cellules adjacentes (tStart < 0, tEnd > 1). Le clamp final se fait dans
    // le handler state (qui respecte les frontières de step).
    const rawRatio = (e.clientX - rect.left) / rect.width;
    const ratio = Math.max(-1, Math.min(2, rawRatio));
    if (dragging === 'start') {
      onTrimTiming(segment.annoStepFullIdx!, segment.annoIdx!, ratio, tEnd);
    } else {
      onTrimTiming(segment.annoStepFullIdx!, segment.annoIdx!, tStart, ratio);
    }
  };

  const handlePointerUp = () => setDragging(null);

  const tooltip = `${color.label}${segment.detail ? ' ' + segment.detail : ''}${
    segment.movePx > 0 ? ` · ${Math.round(segment.movePx)}px` : ''
  }${
    isMovementWithAnno
      ? ` · phase=${phase} · t=[${tStart.toFixed(2)}, ${tEnd.toFixed(2)}]`
      : ''
  }`;

  return (
    <div
      ref={cellRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative',
        height: 18,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 3,
        // overflow: visible permet au segment de déborder sur les cellules
        // adjacentes quand tStart < 0 ou tEnd > 1.
        overflow: 'visible',
      }}
    >
      {/* Segment visible positionné selon tStart/tEnd. z-index élevé pour
          passer au-dessus des cellules adjacentes quand tStart<0 ou tEnd>1. */}
      <div
        onClick={onClick}
        title={tooltip}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${tStart * 100}%`,
          width: `${(tEnd - tStart) * 100}%`,
          padding: '0 4px',
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
          lineHeight: '18px',
          borderLeft: isMovementWithAnno && phase === 'start' ? `3px solid ${color.fg}` : undefined,
          borderRight: isMovementWithAnno && phase === 'end' ? `3px solid ${color.fg}` : undefined,
          zIndex: 1,
          boxShadow: tStart < 0 || tEnd > 1 ? `0 0 0 1px ${color.fg}` : undefined,
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

      {/* Toggle phase ◀/▶ */}
      {isMovementWithAnno && onTogglePhase && (
        <button
          onClick={handleTogglePhase}
          title={`Basculer en ${phase === 'start' ? 'fin' : 'début'} d'action`}
          style={{
            position: 'absolute',
            bottom: -1,
            left: phase === 'start' ? `${tStart * 100}%` : undefined,
            right: phase === 'end' ? `${(1 - tEnd) * 100}%` : undefined,
            width: 10,
            height: 10,
            padding: 0,
            border: 'none',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 8,
            color: color.fg,
            opacity: 0.9,
            lineHeight: 1,
            borderRadius: 2,
            zIndex: 2,
          }}
        >
          {phase === 'start' ? '◀' : '▶'}
        </button>
      )}

      {/* Poignée de trim gauche (tStart) — peut être négative pour étendre
          dans la cellule précédente */}
      {isMovementWithAnno && onTrimTiming && (
        <div
          onPointerDown={handleHandlePointerDown('start')}
          title="Glisser pour avancer/retarder le début (vers la gauche = étend sur l'étape précédente)"
          style={{
            position: 'absolute',
            top: 0,
            left: `${tStart * 100}%`,
            transform: 'translateX(-50%)',
            width: 8,
            height: '100%',
            cursor: 'ew-resize',
            zIndex: 4,
            background: dragging === 'start' ? '#D85A30' : 'rgba(0,0,0,0.05)',
            borderRadius: 2,
          }}
        />
      )}

      {/* Poignée de trim droite (tEnd) — peut être > 1 pour étendre dans la
          cellule suivante */}
      {isMovementWithAnno && onTrimTiming && (
        <div
          onPointerDown={handleHandlePointerDown('end')}
          title="Glisser pour avancer/retarder la fin (vers la droite = étend sur l'étape suivante)"
          style={{
            position: 'absolute',
            top: 0,
            left: `${tEnd * 100}%`,
            transform: 'translateX(-50%)',
            width: 8,
            height: '100%',
            cursor: 'ew-resize',
            zIndex: 4,
            background: dragging === 'end' ? '#D85A30' : 'rgba(0,0,0,0.05)',
            borderRadius: 2,
          }}
        />
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
