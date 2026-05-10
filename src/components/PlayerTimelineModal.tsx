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
        <div style={{ padding: 24, fontSize: 13, color: '#475569' }}>
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
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.25)',
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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Timeline détaillée — pistes par joueur
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {realStepsCount} étapes · {tracks.length} joueurs · les téléports interpolés sont fusionnés
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: '1px solid #cbd5e1',
              background: '#fff',
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
          color: '#64748b',
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
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 11,
        }}>
          <span style={{ fontWeight: 600, color: '#475569', marginRight: 4 }}>Légende :</span>
          {(['dribble', 'cut', 'screen', 'pass'] as const).map((act) => (
            <LegendChip key={act} activity={act} />
          ))}
          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>·</span>
          {(['tracking', 'closeout', 'help', 'pos'] as const).map((act) => (
            <LegendChip key={act} activity={act} />
          ))}
          <span style={{ color: '#cbd5e1', margin: '0 4px' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ea580c' }} />
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
        background: track.kind === 'attacker' ? '#fed7aa' : '#bfdbfe',
        color: track.kind === 'attacker' ? '#9a3412' : '#1e3a8a',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
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
  const color = ACTIVITY_COLORS[segment.activity];
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
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        border: isCursorHere ? '2px solid #D85A30' : '1px solid transparent',
        boxShadow: isCursorHere ? '0 0 0 1px #fff inset' : 'none',
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
            background: '#ea580c',
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
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '1px 6px',
      background: c.bg,
      color: c.fg,
      borderRadius: 3,
      fontWeight: 600,
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
        background: 'rgba(15, 23, 42, 0.5)',
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
