'use client';

import { useRef, useState, useCallback } from 'react';
import type { AppState } from '@/lib/types';
import {
  formatClock,
  formatShotClock,
  getSecondsPerStep,
  getPossessionSeconds,
  totalDurationSeconds,
} from '@/lib/logic/timecode';

interface TimelineProps {
  state: AppState;
  onSetActiveStep: (idx: number) => void;
  onScrub?: (t: number | null) => void;
  isPlaying: boolean;
  scrubT: number | null;
  playbackT?: number | null;
  /** Contrôles de lecture rendus à côté du scrub track. Optionnels pour
   *  rester rétro-compatible avec d'éventuels usages sans contrôles. */
  onPlayToggle?: () => void;
  onStop?: () => void;
  playbackSpeed?: number;
  onSetPlaybackSpeed?: (s: number) => void;
}

/**
 * Timeline des étapes avec scrubbing fluide + contrôles de lecture inline.
 * - clic sur un marqueur = activeStep
 * - clic-glisser = scrubbing fluide entre les étapes (callback onScrub)
 * - relâcher = snap à l'étape entière la plus proche
 * - barre top : ▶/⏸/■ et slider de vitesse à côté du scrub track
 */
export function Timeline({
  state, onSetActiveStep, onScrub, isPlaying, scrubT, playbackT,
  onPlayToggle, onStop, playbackSpeed, onSetPlaybackSpeed,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const total = state.steps.length;

  const tFromEvent = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || total <= 1) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * (total - 1);
    },
    [total]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (total <= 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    const t = tFromEvent(e.clientX);
    onScrub?.(t);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const t = tFromEvent(e.clientX);
    onScrub?.(t);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
    // Le scrub-drag exprime « fige l'image ici » : on conserve scrubT à la
    // valeur du dernier pointerMove. Le clear de scrubT ne se fait que via
    // ▶ (reprise lecture), ■ (stop) ou clic sur un marqueur d'étape.
  };

  const displayT = scrubT ?? playbackT ?? state.activeStep;
  const ratio = total > 1 ? displayT / (total - 1) : 0;
  const currentStepIdx = Math.round(displayT);
  const currentStep = state.steps[currentStepIdx];

  // Timecode (Étape 13) : mappe la position courante (full-step) sur l'axe
  // des étapes réelles (non-interpolées), puis convertit en secondes.
  const realIndices: number[] = [];
  state.steps.forEach((s, i) => { if (!s.isInterpolated) realIndices.push(i); });
  const fullToRealStep = (fullT: number): number => {
    if (realIndices.length === 0) return 0;
    let iA = -1;
    let iB = -1;
    for (let i = 0; i < realIndices.length; i++) {
      if (realIndices[i] <= fullT) iA = i;
      if (realIndices[i] > fullT && iB === -1) iB = i;
    }
    if (iA === -1) return 0;
    if (iB === -1) return iA;
    const lerp = (fullT - realIndices[iA]) / (realIndices[iB] - realIndices[iA]);
    return iA + lerp;
  };
  const realT = fullToRealStep(displayT);
  const sps = getSecondsPerStep(state);
  const elapsedSec = realT * sps;
  const possSec = getPossessionSeconds(state);
  const shotLeft = Math.max(0, possSec - elapsedSec);
  const totalSec = totalDurationSeconds(state);
  const violation = elapsedSec > possSec;

  const hasControls = onPlayToggle && onStop && onSetPlaybackSpeed && playbackSpeed != null;

  const trackEl = (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'relative',
        height: 28,
        background: '#f1f5f9',
        borderRadius: 8,
        cursor: total > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
        border: '1px solid #e2e8f0',
        padding: '0 14px',
        touchAction: 'none',
        userSelect: 'none',
        flex: '1 1 auto',
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 14,
          right: 14,
          height: 4,
          background: '#cbd5e1',
          borderRadius: 2,
          transform: 'translateY(-50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 14,
          width: `calc((100% - 28px) * ${ratio})`,
          height: 4,
          background: isPlaying ? '#1e40af' : '#D85A30',
          borderRadius: 2,
          transform: 'translateY(-50%)',
          transition: dragging || isPlaying ? 'none' : 'width 200ms',
        }}
      />
      {state.steps.map((s, i) => {
        const stepRatio = total > 1 ? i / (total - 1) : 0.5;
        const isCurrent = i === currentStepIdx;
        const isInterp = !!s.isInterpolated;
        return (
          <div
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              if (!dragging) {
                onScrub?.(null);
                onSetActiveStep(i);
              }
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: `calc(14px + (100% - 28px) * ${stepRatio})`,
              width: isInterp ? 8 : 14,
              height: isInterp ? 8 : 14,
              borderRadius: isInterp ? 4 : 7,
              background: isCurrent ? '#D85A30' : isInterp ? '#cbd5e1' : '#fff',
              border: `${isInterp ? 1 : 2}px solid ${isCurrent ? '#9a3412' : isInterp ? '#94a3b8' : '#94a3b8'}`,
              opacity: isInterp ? 0.6 : 1,
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
            title={`Étape ${i + 1}${s.label ? ' — ' + s.label : ''}${isInterp ? ' (transition)' : ''}`}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: `calc(14px + (100% - 28px) * ${ratio})`,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: isPlaying ? '#1e40af' : '#D85A30',
          border: '2px solid #fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          transition: dragging || isPlaying ? 'none' : 'left 200ms',
        }}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 0, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasControls && (
          <>
            <button
              onClick={onPlayToggle}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${isPlaying ? '#9a3412' : '#fed7aa'}`,
                background: isPlaying ? '#D85A30' : '#fff',
                color: isPlaying ? '#fff' : '#7c2d12',
                cursor: 'pointer',
                fontWeight: 500,
                flex: '0 0 auto',
                minWidth: 60,
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={onStop}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #fed7aa',
                background: '#fff',
                color: '#7c2d12',
                cursor: 'pointer',
                fontWeight: 500,
                flex: '0 0 auto',
              }}
            >
              ■
            </button>
          </>
        )}
        {trackEl}
        {hasControls && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
            <input
              type="range"
              min={0.3}
              max={2}
              step={0.1}
              value={playbackSpeed}
              onChange={(e) => onSetPlaybackSpeed?.(parseFloat(e.target.value))}
              title={`vitesse : ${playbackSpeed!.toFixed(1)}×`}
              style={{ width: 70 }}
            />
            <span style={{ fontSize: 10, minWidth: 28, textAlign: 'right', color: '#57534e' }}>
              {playbackSpeed!.toFixed(1)}×
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', lineHeight: 1.2, alignItems: 'center' }}>
        <span>
          Étape {currentStepIdx + 1} / {total}
          {currentStep?.label ? ` — ${currentStep.label}` : ''}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
          <span title={`Possession : ${sps.toFixed(1)} s / étape · total ${totalSec.toFixed(1)} s`}>
            {formatClock(elapsedSec)} / {formatClock(totalSec)}
          </span>
          <span
            title="Shot clock (24s par défaut)"
            style={{
              padding: '1px 6px',
              borderRadius: 4,
              fontWeight: 700,
              background: violation ? '#fee2e2' : shotLeft < 5 ? '#fef3c7' : '#f1f5f9',
              color: violation ? '#991b1b' : shotLeft < 5 ? '#92400e' : '#334155',
            }}
          >
            ⏱ {violation ? 'VIOL.' : formatShotClock(shotLeft)}
          </span>
        </span>
        <span>porteur : {currentStep?.ballCarrier}</span>
      </div>
    </div>
  );
}
