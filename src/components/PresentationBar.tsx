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
  realStepPosition,
  nextRealStepIndex,
  prevRealStepIndex,
  isOnFirstRealStep,
  isOnLastRealStep,
} from '@/lib/logic/playback/realSteps';
import { ChevronLeft, ChevronRight, Play, Square } from 'lucide-react';

interface PresentationBarProps {
  steps: Step[];
  activeStep: number;
  onSetActiveStep: (idx: number) => void;
  /** Lance / arrête la lecture animée de toute la séquence. */
  onTogglePlay: () => void;
  isPlaying: boolean;
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
}: PresentationBarProps) {
  const { current, total } = realStepPosition(steps, activeStep);
  const atFirst = isOnFirstRealStep(steps, activeStep);
  const atLast = isOnLastRealStep(steps, activeStep);
  const label = steps[activeStep]?.label || 'Sans description';

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
        alignItems: 'center',
        gap: 12,
        zIndex: 55,
        padding: '10px 12px',
        borderRadius: 16,
        background: 'rgba(15,23,42,0.78)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        maxWidth: 'calc(100% - 28px)',
      }}
    >
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
          maxWidth: 360,
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
          Étape {current} / {total}
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
  );
}
