'use client';

import { useState } from 'react';
import { StepThumbnail } from '../StepThumbnail';
import type { AppState } from '@/lib/types';
import { Play, Pause, Maximize2, Minimize2, Eye, EyeOff } from 'lucide-react';

interface MiniCourtPreviewProps {
  state: AppState;
  activeStep: number;
  onSetActiveStep: (idx: number) => void;
  isPlaying?: boolean;
  onPlayToggle?: () => void;
}

export function MiniCourtPreview({
  state,
  activeStep,
  isPlaying = false,
  onPlayToggle,
}: MiniCourtPreviewProps) {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Afficher l'aperçu du terrain"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 100,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <Eye size={18} />
      </button>
    );
  }

  const width = expanded ? 420 : 260;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width,
        background: 'rgba(21, 27, 38, 0.82)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s, transform 0.2s',
      }}
    >
      {/* Header mini-terrain */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--bt-text-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          userSelect: 'none',
        }}
      >
        <span>🏀 Aperçu du terrain</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onPlayToggle && (
            <button
              onClick={onPlayToggle}
              style={{
                background: 'transparent',
                border: 'none',
                color: isPlaying ? 'var(--bt-orange-text)' : '#fff',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
              }}
              title={isPlaying ? 'Pause' : 'Lecture'}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--bt-text-dim)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
            title={expanded ? 'Réduire' : 'Agrandir'}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--bt-text-dim)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
            title="Masquer"
          >
            <EyeOff size={12} />
          </button>
        </div>
      </div>

      {/* Visualisation statique de l'étape */}
      <div
        style={{
          padding: 8,
          background: 'var(--bt-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', borderRadius: 6, overflow: 'hidden' }}>
          <StepThumbnail state={state} stepIdx={activeStep} showDefense={true} />
        </div>
      </div>

      {/* Footer / Description */}
      <div
        style={{
          padding: '6px 10px',
          background: 'rgba(0, 0, 0, 0.1)',
          fontSize: 10,
          color: 'var(--bt-text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.03)',
        }}
      >
        Étape {activeStep + 1} : {state.steps[activeStep]?.label || 'Sans description'}
      </div>
    </div>
  );
}
