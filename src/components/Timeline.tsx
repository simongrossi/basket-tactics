'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AppState } from '@/lib/types';
import {
  formatClock,
  formatShotClock,
  getSecondsPerStep,
  getPossessionSeconds,
  totalDurationSeconds,
} from '@/lib/logic/timecode';

const TIMELINE_UI = {
  surface: '#20252d',
  surfaceRaised: '#252b34',
  surfaceHover: '#303744',
  border: '#343b47',
  borderStrong: '#465061',
  text: '#f3f4f6',
  muted: '#cbd5e1',
  dim: '#94a3b8',
  orange: '#D85A30',
  orangeSoft: '#fdba74',
  blue: '#378ADD',
} as const;

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

/** Résolutions de navigation frame-by-frame. Au plus fin (60), chaque clic
 *  correspond à un frame d'animation (~16ms à vitesse 1×, équivalent au tick
 *  de playback). Au plus large (10), on saute par 1/10 de step pour avancer
 *  vite. Raccourcis clavier ←/→ utilisent le mode fin par défaut. */
const SUBFRAMES_FINE = 60;
const SUBFRAMES_COARSE = 10;

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
  const totalT = total > 1 ? total - 1 : 0;
  // Frame fine = unité d'animation (~60 par step). Frame coarse = 1/10 de
  // step pour avancer rapidement entre deux moments distincts.
  const currentFineIdx = Math.round(displayT * SUBFRAMES_FINE);
  const totalFineFrames = Math.round(totalT * SUBFRAMES_FINE);
  const goFineFrame = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(totalT, (currentFineIdx + delta) / SUBFRAMES_FINE));
    onScrub?.(next);
  }, [currentFineIdx, totalT, onScrub]);
  const goCoarseFrame = useCallback((delta: number) => {
    const currentCoarse = Math.round(displayT * SUBFRAMES_COARSE);
    const next = Math.max(0, Math.min(totalT, (currentCoarse + delta) / SUBFRAMES_COARSE));
    onScrub?.(next);
  }, [displayT, totalT, onScrub]);

  // Raccourcis clavier ← / → (fine, +1/-1) et Shift+← / Shift+→ (coarse).
  // Désactivés si focus sur un input ou si la lecture est en cours.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isPlaying) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) goCoarseFrame(-1);
        else goFineFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) goCoarseFrame(1);
        else goFineFrame(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, goFineFrame, goCoarseFrame]);
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
        background: TIMELINE_UI.surfaceRaised,
        borderRadius: 8,
        cursor: total > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
        border: `1px solid ${TIMELINE_UI.border}`,
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
          background: '#3a424f',
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
          background: isPlaying ? TIMELINE_UI.blue : TIMELINE_UI.orange,
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
              background: isCurrent ? TIMELINE_UI.orange : isInterp ? '#3a424f' : TIMELINE_UI.surface,
              border: `${isInterp ? 1 : 2}px solid ${isCurrent ? TIMELINE_UI.orangeSoft : isInterp ? '#4a5362' : TIMELINE_UI.borderStrong}`,
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
          background: isPlaying ? TIMELINE_UI.blue : TIMELINE_UI.orange,
          border: '2px solid #f3f4f6',
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
                border: `1px solid ${isPlaying ? TIMELINE_UI.orangeSoft : TIMELINE_UI.borderStrong}`,
                background: isPlaying ? TIMELINE_UI.orange : TIMELINE_UI.surfaceRaised,
                color: isPlaying ? '#fff' : TIMELINE_UI.orangeSoft,
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
                border: `1px solid ${TIMELINE_UI.border}`,
                background: TIMELINE_UI.surface,
                color: TIMELINE_UI.orangeSoft,
                cursor: 'pointer',
                fontWeight: 500,
                flex: '0 0 auto',
              }}
            >
              ■
            </button>
            {/* Navigation frame-by-frame pour debug visuel fin.
                ⏪/⏩ : 1/10 de step (coarse, ~100ms à 1×). Aussi Shift+←/→.
                ◀/▶ : 1/60 de step (fine, ~16ms à 1×, = un frame d'animation).
                Aussi ←/→ au clavier. */}
            <button
              onClick={() => goCoarseFrame(-1)}
              disabled={isPlaying || displayT <= 0}
              title="Reculer 1/10 step (Shift+←)"
              style={{
                fontSize: 11,
                padding: '4px 5px',
                borderRadius: 6,
                border: `1px solid ${TIMELINE_UI.border}`,
                background: TIMELINE_UI.surface,
                color: TIMELINE_UI.orangeSoft,
                cursor: isPlaying || displayT <= 0 ? 'not-allowed' : 'pointer',
                opacity: isPlaying || displayT <= 0 ? 0.4 : 1,
                flex: '0 0 auto',
              }}
            >
              ⏪
            </button>
            <button
              onClick={() => goFineFrame(-1)}
              disabled={isPlaying || currentFineIdx <= 0}
              title="Reculer un frame (1/60 step ≈ 16ms, ←)"
              style={{
                fontSize: 11,
                padding: '4px 6px',
                borderRadius: 6,
                border: `1px solid ${TIMELINE_UI.border}`,
                background: TIMELINE_UI.surface,
                color: TIMELINE_UI.orangeSoft,
                cursor: isPlaying || currentFineIdx <= 0 ? 'not-allowed' : 'pointer',
                opacity: isPlaying || currentFineIdx <= 0 ? 0.4 : 1,
                flex: '0 0 auto',
              }}
            >
              ◀
            </button>
            <span
              title="Frame fine courante / total (résolution 1/60 step). ←/→ clavier pour avancer fin, Shift+←/→ pour avancer grossier."
              style={{
                fontSize: 10,
                color: TIMELINE_UI.muted,
                fontVariantNumeric: 'tabular-nums',
                minWidth: 56,
                textAlign: 'center',
                flex: '0 0 auto',
              }}
            >
              f{currentFineIdx}/{totalFineFrames}
            </span>
            <button
              onClick={() => goFineFrame(1)}
              disabled={isPlaying || currentFineIdx >= totalFineFrames}
              title="Avancer un frame (1/60 step ≈ 16ms, →)"
              style={{
                fontSize: 11,
                padding: '4px 6px',
                borderRadius: 6,
                border: `1px solid ${TIMELINE_UI.border}`,
                background: TIMELINE_UI.surface,
                color: TIMELINE_UI.orangeSoft,
                cursor: isPlaying || currentFineIdx >= totalFineFrames ? 'not-allowed' : 'pointer',
                opacity: isPlaying || currentFineIdx >= totalFineFrames ? 0.4 : 1,
                flex: '0 0 auto',
              }}
            >
              ▶
            </button>
            <button
              onClick={() => goCoarseFrame(1)}
              disabled={isPlaying || displayT >= totalT}
              title="Avancer 1/10 step (Shift+→)"
              style={{
                fontSize: 11,
                padding: '4px 5px',
                borderRadius: 6,
                border: `1px solid ${TIMELINE_UI.border}`,
                background: TIMELINE_UI.surface,
                color: TIMELINE_UI.orangeSoft,
                cursor: isPlaying || displayT >= totalT ? 'not-allowed' : 'pointer',
                opacity: isPlaying || displayT >= totalT ? 0.4 : 1,
                flex: '0 0 auto',
              }}
            >
              ⏩
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
            <span style={{ fontSize: 10, minWidth: 28, textAlign: 'right', color: TIMELINE_UI.muted }}>
              {playbackSpeed!.toFixed(1)}×
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: TIMELINE_UI.muted, lineHeight: 1.2, alignItems: 'center' }}>
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
              background: violation ? 'rgba(248, 113, 113, 0.16)' : shotLeft < 5 ? 'rgba(251, 191, 36, 0.16)' : TIMELINE_UI.surfaceRaised,
              color: violation ? '#fca5a5' : shotLeft < 5 ? '#fbbf24' : TIMELINE_UI.muted,
              border: `1px solid ${violation ? 'rgba(248, 113, 113, 0.28)' : shotLeft < 5 ? 'rgba(251, 191, 36, 0.26)' : TIMELINE_UI.border}`,
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
