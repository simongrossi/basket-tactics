'use client';

// Phase I + E.1 V1 — HUD compact qui s'affiche par-dessus le terrain
// quand un match IA est en cours ET que les panneaux latéraux sont
// masqués (présentation plein écran). Sans cet overlay, l'utilisateur
// passant en presentMode pendant un match perdrait toute info live.
//
// Layout : positionné absolu côté top-center du conteneur terrain.
// Affiche score home/away + shot clock + équipe attaquante + 1 bouton
// stop. Tous les autres contrôles (pause/resume, sélecteur possessions)
// restent dans le panneau latéral qui doit être ré-affiché pour les
// utiliser.

import type { MatchState } from '@/lib/logic/match/gameLoop';

interface LiveMatchOverlayProps {
  matchState: MatchState | null;
  onStop: () => void;
  /** Sortie du mode présentation. Appelée quand l'utilisateur clique sur
   *  le bouton fermer dans l'overlay. */
  onExitPresent?: () => void;
}

export function LiveMatchOverlay({ matchState, onStop, onExitPresent }: LiveMatchOverlayProps) {
  if (!matchState) return null;

  const shotClockSec = Math.max(0, matchState.shotClockMs / 1000);
  const shotClockColor =
    shotClockSec <= 4 ? '#dc2626' : shotClockSec <= 8 ? '#d97706' : '#16a34a';
  const isAway = matchState.attackingTeam === 'away';

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        background: 'rgba(15, 23, 42, 0.92)',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Score HOME */}
      <div
        style={{
          textAlign: 'center',
          padding: '4px 10px',
          borderRadius: 5,
          background: !isAway ? '#1e40af' : 'transparent',
          border: !isAway ? '1px solid #60a5fa' : '1px solid transparent',
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>
          {!isAway && '▶ '}home
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: '#dbeafe' }}>
          {matchState.homeScore}
        </div>
      </div>

      {/* Shot clock */}
      <div style={{ textAlign: 'center', padding: '0 6px' }}>
        <div style={{ fontSize: 9, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>
          shot clock
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: shotClockColor, fontFamily: 'monospace' }}>
          {shotClockSec.toFixed(1)}
        </div>
      </div>

      {/* Score AWAY */}
      <div
        style={{
          textAlign: 'center',
          padding: '4px 10px',
          borderRadius: 5,
          background: isAway ? '#991b1b' : 'transparent',
          border: isAway ? '1px solid #f87171' : '1px solid transparent',
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>
          {isAway && '▶ '}away
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: '#fee2e2' }}>
          {matchState.awayScore}
        </div>
      </div>

      {/* Possession indicator */}
      <div
        style={{
          textAlign: 'center',
          padding: '0 8px',
          borderLeft: '1px solid #475569',
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>
          poss.
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', lineHeight: 1.2, marginTop: 2 }}>
          {matchState.possession}
          {matchState.maxPossessions !== null && (
            <span style={{ color: '#64748b' }}>/{matchState.maxPossessions}</span>
          )}
        </div>
      </div>

      {/* Boutons contrôle */}
      <button
        type="button"
        onClick={onStop}
        title="Arrêter le match"
        style={{
          padding: '5px 10px',
          borderRadius: 4,
          border: '1px solid #ef4444',
          background: '#7f1d1d',
          color: '#fee2e2',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ⏹ stop
      </button>
      {onExitPresent && (
        <button
          type="button"
          onClick={onExitPresent}
          title="Quitter le plein écran (Échap)"
          style={{
            padding: '5px 10px',
            borderRadius: 4,
            border: '1px solid #475569',
            background: 'transparent',
            color: '#cbd5e1',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
