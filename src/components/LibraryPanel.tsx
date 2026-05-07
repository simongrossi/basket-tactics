'use client';

import { useState } from 'react';
import type { AppState } from '@/lib/types';
import { TEMPLATES, type Template } from '@/lib/data/templates';
import { Panel, COLORS } from './ui';
import { TemplateLibraryModal } from './TemplateLibraryModal';

interface LibraryPanelProps {
  state: AppState;
  onLoadTemplate: (template: Template) => void;
}

/**
 * Bloc dédié à la bibliothèque de systèmes : un seul bouton qui ouvre la
 * modal complète. Sorti d'OffensePanel pour être un panneau autonome
 * dans la colonne gauche, entre "Attaque" et "Actions".
 */
export function LibraryPanel({ state, onLoadTemplate }: LibraryPanelProps) {
  const c = COLORS.offense;
  const [open, setOpen] = useState(false);
  const hasWork = state.steps.length > 1 || state.steps[0].annotations.length > 0;

  return (
    <Panel theme="offense" title="📚 Bibliothèque">
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          borderLeft: `3px solid ${c.accent}`,
          background: c.bg,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: c.accentText,
          transition: 'background 120ms, border-color 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = c.bgSubtle;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = c.bg;
        }}
        title="Ouvrir la bibliothèque de systèmes prêts à l'emploi"
      >
        <span>📚 {TEMPLATES.length} systèmes prêts</span>
        <span style={{ fontSize: 10, color: c.accent, opacity: 0.7 }}>ouvrir →</span>
      </button>
      {open && (
        <TemplateLibraryModal
          hasWorkInProgress={hasWork}
          onLoad={onLoadTemplate}
          onClose={() => setOpen(false)}
        />
      )}
    </Panel>
  );
}
