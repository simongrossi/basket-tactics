// J.7 V1 — Panneau debug joueur (compact, tous défenseurs).
//
// Affiche une table compacte avec les flags clés extraits de
// frame.debug.defenders pour les 5 défenseurs. Pour activer le contenu,
// state.showPlayerDebug doit être true (active aussi collectDecisions
// dans useCourtFrame).
//
// Différent de ScreenPlayerDebugPanel : ne nécessite pas de sélection
// de défenseur, montre tout en permanence. Vue d'ensemble pour le coach.

import type { DefenderId } from '@/lib/types';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';

interface PlayerDebugTableProps {
  frame: PlaybackFrame | null;
  visible?: boolean;
}

const DEFENDER_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

export function PlayerDebugTable({ frame, visible = true }: PlayerDebugTableProps) {
  if (!visible || !frame) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 14,
        top: 14,
        width: 320,
        maxWidth: 'calc(100% - 28px)',
        background: 'rgba(15, 23, 42, 0.94)',
        color: '#e2e8f0',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 10,
        lineHeight: 1.25,
        pointerEvents: 'none',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.24)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={{ fontWeight: 800, color: '#fff', marginBottom: 6, fontSize: 11 }}>
        🔬 Debug joueur (J.7)
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '26px 38px 50px 38px 1fr',
          gap: '2px 6px',
          alignItems: 'center',
        }}
      >
        <HeaderCell>ID</HeaderCell>
        <HeaderCell>match</HeaderCell>
        <HeaderCell>screen</HeaderCell>
        <HeaderCell>route</HeaderCell>
        <HeaderCell>aide</HeaderCell>

        {DEFENDER_IDS.map((dId) => {
          const def = frame.defPos[dId];
          if (!def) return null;
          const dec = frame.debug?.defenders[dId];
          const help =
            def.helpTriggered
              ? `${def.helpKind ?? 'help'} f=${(def.helpFactor ?? 0).toFixed(2)}`
              : '—';
          return (
            <RowCells
              key={dId}
              id={dId}
              matched={def.matchedTo}
              screenState={dec?.screenState ?? def.screenPhase ?? 'idle'}
              route={dec?.routeKind ?? '—'}
              help={help}
            />
          );
        })}
      </div>
      {!frame.debug && (
        <div style={{ marginTop: 8, color: '#fbbf24', fontSize: 9 }}>
          ⚠ frame.debug indisponible — activer "debug joueur" dans Paramètres.
        </div>
      )}
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 9, textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

function RowCells({
  id, matched, screenState, route, help,
}: {
  id: string;
  matched: string;
  screenState: string;
  route: string;
  help: string;
}) {
  return (
    <>
      <span style={{ color: '#fff', fontWeight: 700 }}>{id}</span>
      <span style={{ color: '#fdba74' }}>{matched}</span>
      <span style={{ color: '#cbd5e1' }}>{screenState}</span>
      <span style={{ color: '#cbd5e1' }}>{route}</span>
      <span style={{ color: help === '—' ? '#475569' : '#86efac' }}>{help}</span>
    </>
  );
}
