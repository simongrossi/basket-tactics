'use client';

// Télécommande de présentation (coaching #1) — barre flottante en bas du
// terrain en mode lecteur/présentation. Permet de dérouler un système phase
// par phase devant les joueurs : étape précédente / suivante (en sautant les
// étapes interpolées), lecture animée, et compteur + libellé de l'étape.
//
// Pensée pour un usage tablette / TV : grandes cibles tactiles, zéro chrome
// d'édition. La navigation au clavier (←/→ pour les étapes, espace pour
// lire) est gérée par la page parente.

import type { Step } from '@/lib/types';
import {
  nextRealStepIndex,
  prevRealStepIndex,
  isOnFirstRealStep,
  isOnLastRealStep,
} from '@/lib/logic/playback/realSteps';
import { formatStepCounter, stepCounterAt } from '@/lib/logic/stepNumbering';
import { ChevronLeft, ChevronRight, Play, Repeat, RotateCcw, Square } from 'lucide-react';

interface PresentationBarProps {
  steps: Step[];
  activeStep: number;
  onSetActiveStep: (idx: number) => void;
  /** Lance / arrête la lecture animée de toute la séquence. */
  onTogglePlay: () => void;
  isPlaying: boolean;
  /** Position fine (étapes fractionnaires) pendant une pause/lecture. */
  scrubT?: number | null;
  playbackT?: number | null;
  /** Scrub manuel : le parent met la lecture en pause. */
  onScrub?: (t: number) => void;
  speed?: number;
  onSetSpeed?: (s: number) => void;
  loop?: boolean;
  onToggleLoop?: () => void;
  onRestart?: () => void;
}

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 15,
  background: 'rgba(30,41,59,0.92)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
  transition: 'background 0.15s, opacity 0.15s',
  touchAction: 'manipulation',
};

export function PresentationBar({
  steps,
  activeStep,
  onSetActiveStep,
  onTogglePlay,
  isPlaying,
  scrubT,
  playbackT,
  onScrub,
  speed,
  onSetSpeed,
  loop,
  onToggleLoop,
  onRestart,
}: PresentationBarProps) {
  const counter = stepCounterAt(steps, activeStep);
  const atFirst = isOnFirstRealStep(steps, activeStep);
  const atLast = isOnLastRealStep(steps, activeStep);
  const label = steps[activeStep]?.label || 'Sans description';
  const totalT = Math.max(0, steps.length - 1);
  const fineT = Math.max(0, Math.min(totalT, scrubT ?? playbackT ?? activeStep));
  const speedOptions = Array.from(new Set([0.5, 1, 1.5, 2, speed ?? 1])).sort((a, b) => a - b);

  const goPrev = () => {
    if (!atFirst) onSetActiveStep(prevRealStepIndex(steps, activeStep));
  };
  const goNext = () => {
    if (!atLast) onSetActiveStep(nextRealStepIndex(steps, activeStep));
  };

  return (
    <div
      className="presenter-bar"
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 8,
        zIndex: 55,
        padding: '10px 12px',
        borderRadius: 16,
        background: 'rgba(15,23,42,0.78)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        width: 'min(640px, calc(100% - 28px))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Précédent */}
        <button
          type="button"
          aria-label="Étape précédente"
          onClick={goPrev}
          disabled={atFirst}
          style={{
            ...btnBase,
            width: 56,
            height: 56,
            opacity: atFirst ? 0.35 : 1,
            cursor: atFirst ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={26} />
        </button>

        {/* Lire / Stop */}
        <button
          type="button"
          aria-label={isPlaying ? 'Arrêter' : 'Lire'}
          onClick={onTogglePlay}
          style={{
            ...btnBase,
            width: 56,
            height: 56,
            background: isPlaying ? 'rgba(220,38,38,0.92)' : 'rgba(234,88,12,0.95)',
            border: isPlaying ? '1px solid #dc2626' : '1px solid #ea580c',
          }}
        >
          {isPlaying ? <Square size={22} /> : <Play size={24} />}
        </button>

        {/* Compteur + libellé */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            flex: '1 1 auto',
            padding: '0 6px',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: '#fdba74',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {formatStepCounter(counter)}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        </div>

        {/* Suivant */}
        <button
          type="button"
          aria-label="Étape suivante"
          onClick={goNext}
          disabled={atLast}
          style={{
            ...btnBase,
            width: 56,
            height: 56,
            opacity: atLast ? 0.35 : 1,
            cursor: atLast ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={26} />
        </button>
      </div>

      {/* Transport fin : scrub, boucle, vitesse, retour au début. */}
      {onScrub && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            aria-label="Revenir au début"
            onClick={onRestart}
            disabled={!onRestart}
            style={{
              ...btnBase,
              width: 40,
              height: 40,
              borderRadius: 10,
              flex: '0 0 auto',
              opacity: onRestart ? 1 : 0.4,
            }}
          >
            <RotateCcw size={18} />
          </button>
          <input
            type="range"
            min={0}
            max={totalT}
            step={0.01}
            value={fineT}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Position dans le système"
            style={{ flex: '1 1 auto', minWidth: 0, accentColor: '#fb923c' }}
          />
          <span
            style={{
              fontSize: 11,
              color: '#cbd5e1',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 54,
              textAlign: 'right',
              flex: '0 0 auto',
            }}
          >
            {fineT.toFixed(1)} / {totalT}
          </span>
          <button
            type="button"
            aria-label="Lecture en boucle"
            aria-pressed={!!loop}
            onClick={onToggleLoop}
            style={{
              ...btnBase,
              width: 40,
              height: 40,
              borderRadius: 10,
              flex: '0 0 auto',
              background: loop ? 'rgba(234,88,12,0.95)' : 'rgba(30,41,59,0.92)',
              borderColor: loop ? '#ea580c' : 'rgba(255,255,255,0.12)',
            }}
          >
            <Repeat size={18} />
          </button>
          {onSetSpeed && (
            <select
              aria-label="Vitesse de lecture"
              value={speed ?? 1}
              onChange={(e) => onSetSpeed(Number(e.target.value))}
              style={{
                flex: '0 0 auto',
                height: 40,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: 12,
                fontWeight: 700,
                padding: '0 6px',
              }}
            >
              {speedOptions.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
