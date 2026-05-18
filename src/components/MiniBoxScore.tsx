'use client';

// Phase 1.4 — Mini box score affichant les stats équipe agrégées
// pendant un match live multi-possessions : Pts | FG% | TO | REB.
//
// S'affiche en dessous de LiveMatchOverlay quand maxPossessions !== 1
// (= mode démo / match multi-poss). Pas affiché en mode 1-possession
// car ces stats n'ont pas de sens sur une seule possession.

import type { MatchState } from '@/lib/logic/match/gameLoop';

interface MiniBoxScoreProps {
  matchState: MatchState | null;
}

function fmtPercent(made: number, attempted: number): string {
  if (attempted === 0) return '—';
  return `${Math.round((made / attempted) * 100)}%`;
}

export function MiniBoxScore({ matchState }: MiniBoxScoreProps) {
  if (!matchState) return null;
  // Pas de box score en mode 1-possession
  if (matchState.maxPossessions === 1) return null;

  const { home, away } = matchState.teamStats;

  return (
    <div
      style={{
        position: 'absolute',
        top: 80, // sous l'overlay principal (top: 12 + ~60px hauteur)
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99,
        padding: '6px 10px',
        background: 'rgba(15, 23, 42, 0.88)',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        color: '#cbd5e1',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 10,
        backdropFilter: 'blur(6px)',
      }}
    >
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={{ textAlign: 'left', padding: '2px 8px 2px 0' }}>team</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', minWidth: 28 }}>pts</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', minWidth: 36 }}>fg%</th>
            <th style={{ textAlign: 'right', padding: '2px 6px', minWidth: 26 }}>to</th>
            <th style={{ textAlign: 'right', padding: '2px 0 2px 6px', minWidth: 32 }}>reb</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ color: '#dbeafe', fontWeight: 600, padding: '1px 8px 1px 0' }}>home</td>
            <td style={{ textAlign: 'right', padding: '1px 6px' }}>{home.points}</td>
            <td style={{ textAlign: 'right', padding: '1px 6px' }}>{fmtPercent(home.fgMade, home.fgAttempted)}</td>
            <td style={{ textAlign: 'right', padding: '1px 6px' }}>{home.turnovers}</td>
            <td style={{ textAlign: 'right', padding: '1px 0 1px 6px' }}>{home.oReb + home.dReb}</td>
          </tr>
          <tr>
            <td style={{ color: '#fee2e2', fontWeight: 600, padding: '1px 8px 1px 0' }}>away</td>
            <td style={{ textAlign: 'right', padding: '1px 6px' }}>{away.points}</td>
            <td style={{ textAlign: 'right', padding: '1px 6px' }}>{fmtPercent(away.fgMade, away.fgAttempted)}</td>
            <td style={{ textAlign: 'right', padding: '1px 6px' }}>{away.turnovers}</td>
            <td style={{ textAlign: 'right', padding: '1px 0 1px 6px' }}>{away.oReb + away.dReb}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
