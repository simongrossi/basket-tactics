'use client';

import { useEffect, useMemo } from 'react';
import type { AppState } from '@/lib/types';
import {
  computePlayerTracks,
  countRealSteps,
  ACTIVITY_COLORS,
  type PlayerTrack,
  type TrackSegment,
} from '@/lib/logic/playerTracks';

const MODAL_UI = {
  overlay: 'rgba(7, 10, 15, 0.72)',
  bg: '#171b22',
  surface: '#20252d',
  cell: '#252b34',
  border: '#343b47',
  borderStrong: '#465061',
  text: '#f3f4f6',
  muted: '#cbd5e1',
  dim: '#94a3b8',
  orange: '#D85A30',
} as const;

const DARK_ACTIVITY_COLORS: typeof ACTIVITY_COLORS = {
  idle:     { bg: '#222831', fg: '#94a3b8', label: 'idle' },
  pos:      { bg: '#26313d', fg: '#cbd5e1', label: 'position' },
  dribble:  { bg: 'rgba(249, 115, 22, 0.22)', fg: '#fdba74', label: 'dribble' },
  cut:      { bg: 'rgba(251, 191, 36, 0.23)', fg: '#fbbf24', label: 'cut' },
  screen:   { bg: 'rgba(248, 113, 113, 0.22)', fg: '#fca5a5', label: 'écran' },
  pass:     { bg: 'rgba(245, 158, 11, 0.22)', fg: '#fcd34d', label: 'passe' },
  tracking: { bg: 'rgba(96, 165, 250, 0.24)', fg: '#93c5fd', label: 'suit' },
  closeout: { bg: 'rgba(56, 189, 248, 0.22)', fg: '#7dd3fc', label: 'closeout' },
  help:     { bg: 'rgba(167, 139, 250, 0.24)', fg: '#c4b5fd', label: 'aide' },
};

interface PlayerTimelineModalProps {
  state: AppState;
  /** Step index dans state.steps (incluant interpolés). Pour positionner
   *  l'indicateur de curseur synchronisé avec la timeline globale. */
  currentFullStepIdx: number;
  onClose: () => void;
  /** Permet de sauter à un step réel en cliquant sur une piste. */
  onJumpToRealStep?: (realStepIdx: number) => void;
}

export function PlayerTimelineModal({
  state,
  currentFullStepIdx,
  onClose,
  onJumpToRealStep,
}: PlayerTimelineModalProps) {
  const tracks = useMemo(() => computePlayerTracks(state), [state]);
  const realStepsCount = useMemo(() => countRealSteps(state), [state]);

  // Mapping fullStepIdx → realStepIdx pour positionner le curseur.
  const cursorRealIdx = useMemo(() => {
    let count = 0;
    for (let i = 0; i <= currentFullStepIdx && i < state.steps.length; i++) {
      if (!state.steps[i].isInterpolated) {
        if (i === currentFullStepIdx) return count;
        count++;
      }
    }
    return Math.min(count, realStepsCount - 1);
  }, [state, currentFullStepIdx, realStepsCount]);

  // Échap ferme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (tracks.length === 0 || realStepsCount < 2) {
    return (
      <Backdrop onClose={onClose}>
        <div style={{ padding: 24, fontSize: 13, color: MODAL_UI.muted }}>
          Crée au moins 2 étapes pour voir la timeline détaillée par joueur.
        </div>
      </Backdrop>
    );
  }

  // Nombre de "colonnes" = transitions = realSteps - 1.
  const transitionCount = realStepsCount - 1;

  return (
    <Backdrop onClose={onClose}>
      <div
        style={{
          background: MODAL_UI.bg,
          border: `1px solid ${MODAL_UI.border}`,
          borderRadius: 10,
          boxShadow: '0 22px 60px rgba(0, 0, 0, 0.45)',
          padding: 16,
          width: 'min(95vw, 1100px)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: MODAL_UI.text }}>
              Timeline détaillée — pistes par joueur
            </div>
            <div style={{ fontSize: 11, color: MODAL_UI.dim, marginTop: 2 }}>
              {realStepsCount} étapes · {tracks.length} joueurs · les téléports interpolés sont fusionnés
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: `1px solid ${MODAL_UI.borderStrong}`,
              background: MODAL_UI.surface,
              color: MODAL_UI.text,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >fermer</button>
        </div>

        {/* En-tête des colonnes (numéros d'étape) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `60px repeat(${transitionCount}, 1fr)`,
          gap: 4,
          marginBottom: 6,
          fontSize: 10,
          color: MODAL_UI.dim,
        }}>
          <div></div>
          {Array.from({ length: transitionCount }, (_, i) => (
            <div
              key={i}
              onClick={() => onJumpToRealStep?.(i + 1)}
              style={{
                textAlign: 'center',
                padding: '2px 0',
                cursor: onJumpToRealStep ? 'pointer' : 'default',
              }}
              title={`Sauter à l'étape ${i + 2}`}
            >
              {i + 1} → {i + 2}
            </div>
          ))}
        </div>

        {/* Pistes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {tracks.filter((t) => t.kind === 'attacker').map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              transitionCount={transitionCount}
              cursorRealIdx={cursorRealIdx}
              onJumpToRealStep={onJumpToRealStep}
            />
          ))}
          <div style={{ height: 6 }} />
          {tracks.filter((t) => t.kind === 'defender').map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              transitionCount={transitionCount}
              cursorRealIdx={cursorRealIdx}
              onJumpToRealStep={onJumpToRealStep}
            />
          ))}
        </div>

        {/* Légende */}
        <div style={{
          marginTop: 14,
          padding: 10,
          borderTop: `1px solid ${MODAL_UI.border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 11,
        }}>
          <span style={{ fontWeight: 700, color: MODAL_UI.muted, marginRight: 4 }}>Légende :</span>
          {(['dribble', 'cut', 'screen', 'pass'] as const).map((act) => (
            <LegendChip key={act} activity={act} />
          ))}
          <span style={{ color: MODAL_UI.dim, margin: '0 4px' }}>·</span>
          {(['tracking', 'closeout', 'help', 'pos'] as const).map((act) => (
            <LegendChip key={act} activity={act} />
          ))}
          <span style={{ color: MODAL_UI.dim, margin: '0 4px' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: MODAL_UI.orange }} />
            porteur
          </span>
        </div>
      </div>
    </Backdrop>
  );
}

function TrackRow({
  track,
  transitionCount,
  cursorRealIdx,
  onJumpToRealStep,
}: {
  track: PlayerTrack;
  transitionCount: number;
  cursorRealIdx: number;
  onJumpToRealStep?: (idx: number) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `60px repeat(${transitionCount}, 1fr)`,
      gap: 3,
      alignItems: 'center',
      position: 'relative',
    }}>
      {/* Étiquette joueur */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        background: track.kind === 'attacker' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(55, 138, 221, 0.2)',
        color: track.kind === 'attacker' ? '#fdba74' : '#93c5fd',
        border: `1px solid ${track.kind === 'attacker' ? 'rgba(249, 115, 22, 0.28)' : 'rgba(55, 138, 221, 0.32)'}`,
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 800,
        justifyContent: 'center',
      }}>
        {track.id}
      </div>
      {/* Segments */}
      {track.segments.slice(0, transitionCount).map((seg, i) => (
        <SegmentCell
          key={i}
          segment={seg}
          isCursorHere={i + 1 === cursorRealIdx}
          onClick={() => onJumpToRealStep?.(i + 1)}
        />
      ))}
    </div>
  );
}

function SegmentCell({
  segment,
  isCursorHere,
  onClick,
}: {
  segment: TrackSegment;
  isCursorHere: boolean;
  onClick?: () => void;
}) {
  const color = DARK_ACTIVITY_COLORS[segment.activity];
  const showCarrierDot = segment.isCarrier;
  return (
    <div
      onClick={onClick}
      title={`${color.label}${segment.detail ? ' ' + segment.detail : ''}${segment.movePx > 0 ? ` · ${Math.round(segment.movePx)}px` : ''}`}
      style={{
        position: 'relative',
        padding: '4px 6px',
        background: color.bg,
        color: color.fg,
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        border: isCursorHere ? `2px solid ${MODAL_UI.orange}` : `1px solid ${color.fg}30`,
        boxShadow: isCursorHere ? '0 0 0 1px rgba(255,255,255,0.16) inset' : 'none',
        userSelect: 'none',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      {showCarrierDot && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: MODAL_UI.orange,
          }}
          title="Porteur de balle"
        />
      )}
      {color.label}
      {segment.detail && (
        <span style={{ opacity: 0.7, marginLeft: 4 }}>{segment.detail}</span>
      )}
    </div>
  );
}

function LegendChip({ activity }: { activity: keyof typeof ACTIVITY_COLORS }) {
  const c = ACTIVITY_COLORS[activity];
  const dark = DARK_ACTIVITY_COLORS[activity];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '1px 6px',
      background: dark.bg,
      color: dark.fg,
      border: `1px solid ${dark.fg}30`,
      borderRadius: 5,
      fontWeight: 700,
    }}>
      {c.label}
    </span>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: MODAL_UI.overlay,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}
