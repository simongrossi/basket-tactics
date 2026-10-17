'use client';

import { formatStepCounter, stepCounterAt } from '@/lib/logic/stepNumbering';
import { InterfaceGate, useInterfaceLevel } from './interface/InterfaceLevel';
import { useRef, useState, useCallback } from 'react';
import { SHORTCUT_LABELS } from '@/hooks/useKeyboardShortcuts';
import type { AppState } from '@/lib/types';
import {
  formatClock,
  fullStepToSeconds,
  formatShotClock,
  isShotClockViolationAt,
  realStepToSeconds,
  shotClockAt,
  shotClockBand,
  totalDurationSeconds,
} from '@/lib/logic/timecode';

const TIMELINE_UI = {
  surface: 'var(--bt-surface)',
  surfaceRaised: 'var(--bt-surface-raised)',
  surfaceHover: 'var(--bt-surface-hover)',
  border: 'var(--bt-border)',
  borderStrong: 'var(--bt-border-strong)',
  text: 'var(--bt-text)',
  muted: 'var(--bt-text-muted)',
  dim: 'var(--bt-text-dim)',
  orange: 'var(--bt-orange)',
  orangeSoft: 'var(--bt-orange-soft)',
  blue: 'var(--bt-accent)',
} as const;

interface TimelineProps {
  state: AppState;
  onSetActiveStep: (idx: number) => void;
  onAddStep?: () => void;
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
  /** Actions additionnelles intégrées dans la barre de contrôle (ex: bouton pistes) */
  extraActions?: React.ReactNode;
}

/** Navigation par fractions de transition. La durée réelle de chaque pas
 * dépend de la durée de cette transition ; ce n'est pas une cadence vidéo. */
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
  state, onSetActiveStep, onAddStep, onScrub, isPlaying, scrubT, playbackT,
  onPlayToggle, onStop, playbackSpeed, onSetPlaybackSpeed, extraActions,
}: TimelineProps) {
  const { development } = useInterfaceLevel();
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

  // Raccourcis clavier : gérés par useKeyboardShortcuts (U03), un seul
  // gestionnaire pour toutes les vues — voir SHORTCUT_LABELS.
  const ratio = total > 1 ? displayT / (total - 1) : 0;
  const currentStepIdx = Math.round(displayT);
  const currentStep = state.steps[currentStepIdx];
  // Même numérotation que le panneau Étapes (cf. stepNumbering).
  const stepCounter = stepCounterAt(state.steps, displayT);
  const counterLabel = stepCounter.rowIndex != null ? state.steps[stepCounter.rowIndex]?.label : undefined;

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
  // B.1 — accumule les durations individuelles de chaque step au lieu d'une
  // simple multiplication globale, pour respecter Step.duration quand défini.
  const elapsedSec = realStepToSeconds(state, realT);
  // B.2 — shot clock honore les resets `step.shotClockRemaining` (14s sur
  // rebond offensif), pas un simple décompte global de la possession.
  const shotLeft = shotClockAt(state, realT);
  const totalSec = totalDurationSeconds(state);
  const violation = isShotClockViolationAt(state, realT);

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
          background: 'var(--bt-border)',
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
              background: isCurrent ? TIMELINE_UI.orange : isInterp ? 'var(--bt-border)' : TIMELINE_UI.surface,
              border: `${isInterp ? 1 : 2}px solid ${isCurrent ? TIMELINE_UI.orangeSoft : isInterp ? 'var(--bt-border-strong)' : TIMELINE_UI.borderStrong}`,
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
          border: '2px solid var(--bt-surface)',
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
              className="bt-touch"
              aria-label={isPlaying ? 'Pause' : 'Lecture'}
              title={isPlaying ? 'Pause (Espace)' : 'Lecture (Espace)'}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${isPlaying ? TIMELINE_UI.orangeSoft : 'var(--bt-btn-border)'}`,
                background: isPlaying ? TIMELINE_UI.orange : 'var(--bt-btn-bg)',
                color: isPlaying ? '#fff' : TIMELINE_UI.orangeSoft,
                cursor: 'pointer',
                fontWeight: 600,
                flex: '0 0 auto',
                minWidth: 60,
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={onStop}
              className="bt-touch"
              aria-label="Arrêter et revenir au début"
              title="Arrêter et revenir au début"
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
            <InterfaceGate min="analysis">
            <button
              onClick={() => goCoarseFrame(-1)}
              disabled={isPlaying || displayT <= 0}
              className="bt-touch"
              aria-label="Reculer d’un dixième de transition"
              title={`Reculer 1/10 de transition (${SHORTCUT_LABELS.coarseBack})`}
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
              className="bt-touch"
              aria-label="Reculer d’une image"
              title={`Reculer d’une image (1/60 de transition, touche ${SHORTCUT_LABELS.fineBack})`}
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
              title={`Instant courant. ←/→ : étape ; ${SHORTCUT_LABELS.coarseBack}/${SHORTCUT_LABELS.coarseForward} : 1/10 de transition ; ${SHORTCUT_LABELS.fineBack} / ${SHORTCUT_LABELS.fineForward} : image fine.`}
              style={{
                fontSize: 10,
                color: TIMELINE_UI.muted,
                fontVariantNumeric: 'tabular-nums',
                minWidth: 56,
                textAlign: 'center',
                flex: '0 0 auto',
              }}
            >
              {development ? `f${currentFineIdx}/${totalFineFrames}` : `${fullStepToSeconds(state, displayT).toFixed(2)} s`}
            </span>
            <button
              onClick={() => goFineFrame(1)}
              disabled={isPlaying || currentFineIdx >= totalFineFrames}
              className="bt-touch"
              aria-label="Avancer d’une image"
              title={`Avancer d’une image (1/60 de transition, touche ${SHORTCUT_LABELS.fineForward})`}
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
              className="bt-touch"
              aria-label="Avancer d’un dixième de transition"
              title={`Avancer 1/10 de transition (${SHORTCUT_LABELS.coarseForward})`}
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
            </InterfaceGate>
          </>
        )}
        {trackEl}
        {onAddStep && (
          <button
            type="button"
            onClick={onAddStep}
            disabled={isPlaying}
            className="bt-touch"
            title="Ajouter une étape à la suite (+ étape)"
            style={{
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              border: '1px solid rgba(234, 88, 12, 0.5)',
              background: 'rgba(234, 88, 12, 0.14)',
              color: TIMELINE_UI.orange,
              cursor: isPlaying ? 'not-allowed' : 'pointer',
              opacity: isPlaying ? 0.45 : 1,
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
            }}
          >
            + Étape
          </button>
        )}
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
              aria-label="Vitesse de lecture"
              style={{ width: 70 }}
            />
            <span style={{ fontSize: 10, minWidth: 28, textAlign: 'right', color: TIMELINE_UI.muted }}>
              {playbackSpeed!.toFixed(1)}×
            </span>
          </div>
        )}
        {extraActions}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: TIMELINE_UI.muted, lineHeight: 1.2, alignItems: 'center' }}>
        <span>
          {formatStepCounter(stepCounter)}
          {counterLabel ? ` — ${counterLabel}` : ''}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
          <span title={`Possession totale : ${totalSec.toFixed(1)} s`}>
            {formatClock(elapsedSec)} / {formatClock(totalSec)}
          </span>
          <span
            title="Shot clock (24s par défaut, reset 14s sur rebond offensif). Vert > 8s · jaune 5-8s · rouge ≤ 4s · VIOL. au-delà."
            style={(() => {
              if (violation) {
                return {
                  padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                  background: 'rgba(248, 113, 113, 0.18)',
                  color: '#fca5a5',
                  border: '1px solid rgba(248, 113, 113, 0.32)',
                };
              }
              const band = shotClockBand(shotLeft);
              if (band === 'danger') {
                return {
                  padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                  background: 'rgba(220, 38, 38, 0.18)',
                  color: '#fca5a5',
                  border: '1px solid rgba(220, 38, 38, 0.36)',
                };
              }
              if (band === 'warning') {
                return {
                  padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                  background: 'rgba(251, 191, 36, 0.16)',
                  color: '#fbbf24',
                  border: '1px solid rgba(251, 191, 36, 0.28)',
                };
              }
              return {
                padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                background: 'rgba(22, 163, 74, 0.14)',
                color: '#86efac',
                border: '1px solid rgba(22, 163, 74, 0.26)',
              };
            })()}
          >
            ⏱ {violation ? 'VIOL.' : formatShotClock(shotLeft)}
          </span>
        </span>
        <span>porteur : {currentStep?.ballCarrier}</span>
      </div>
    </div>
  );
}
