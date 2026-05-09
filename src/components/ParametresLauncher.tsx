'use client';

import { useState, useEffect } from 'react';
import type { AppState } from '@/lib/types';
import { Panel, COLORS } from './ui';
import { ParametresPanel } from './ParametresPanel';

interface ParametresLauncherProps {
  state: AppState;
  onPatch: (p: Partial<AppState>) => void;
}

/**
 * Launcher du panneau Paramètres côté gauche (sous Actions).
 * Ouvre une modal pop-up centrée contenant tout le contenu de ParametresPanel
 * (VISU & LÉGENDE + INDICATEURS AUTO). Style cohérent avec LibraryPanel.
 */
export function ParametresLauncher({ state, onPatch }: ParametresLauncherProps) {
  const c = COLORS.defense;
  const [open, setOpen] = useState(false);

  // Fermeture par Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Compteur d'options actives pour donner un retour visuel rapide.
  const activeToggles = countActiveToggles(state);

  return (
    <Panel theme="defense" title="⚙ Paramètres">
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
        onMouseEnter={(e) => { e.currentTarget.style.background = c.bgSubtle; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = c.bg; }}
        title="Visu & légende, indicateurs auto, sens d'attaque"
      >
        <span>⚙ Paramètres ({activeToggles} actifs)</span>
        <span style={{ fontSize: 10, color: c.accent, opacity: 0.7 }}>ouvrir →</span>
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              padding: 8,
              minWidth: 360,
              maxWidth: 480,
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setOpen(false)}
              title="Fermer (Échap)"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 18,
                color: '#64748b',
                width: 28,
                height: 28,
                borderRadius: 6,
                lineHeight: 1,
                zIndex: 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              ×
            </button>
            <ParametresPanel state={state} onPatch={onPatch} />
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Compte les toggles "actifs" (différents de leur valeur par défaut)
 *  pour afficher un compteur rapide sur le bouton launcher. */
function countActiveToggles(state: AppState): number {
  let n = 0;
  // VISU & LÉGENDE — ces 8 toggles sont default true ou contextuels
  if (state.showHelpLines) n++;
  if (state.showMatchups !== false) n++;
  if (state.showPassLanes) n++;
  if (state.showGhosts) n++;
  if (state.showActionOrder) n++;
  if (state.showHeatmap) n++;
  if (state.showThreats) n++;
  if (state.showBestAction) n++;
  if (state.showHelpDebug) n++;
  if (state.showFieldOfViewAll) n++;
  if (state.showFieldOfViewAllDefenders) n++;
  if (state.showFieldOfViewAllAttackers) n++;
  // INDICATEURS AUTO — default true partout
  if (state.showSwitchMatchups !== false) n++;
  if (state.showScreenIndicators !== false) n++;
  if (state.showStateRings !== false) n++;
  if (state.showLockBadges !== false) n++;
  if (state.showZoneTracking !== false) n++;
  if (state.showContestedPass !== false) n++;
  if (state.showBlockedPass !== false) n++;
  if (state.showOffBallScreenIndicator !== false) n++;
  if (state.showLateRing !== false) n++;
  if (state.showCloseoutRing !== false) n++;
  if (state.showDenyingRing !== false) n++;
  if (state.showForcedScreenerBadge !== false) n++;
  return n;
}
