// Sous-menu "action auto" dans le ContextMenu attaquant :
//
//  - Passer vers ▸ O2 / O3 / O4 / O5
//  - Écran pour ▸ Ox ▸ gauche / droite / devant / dos
//
// Le composant produit l'`Annotation` finale en appelant
// `generateAutoAnnotation` et la transmet au parent via `onCreate`. Si la
// fonction renvoie null (cas dégénéré), on no-op silencieusement.

import { useState } from 'react';
import type { AppState, AttackerId } from '@/lib/types';
import { getActiveAttackerIds } from '@/lib/logic/players';
import {
  generateAutoAnnotation,
  type ScreenSide,
} from '@/lib/logic/autoActions/generateAutoAnnotation';
import { DARK_PANEL, useSidebarTheme } from '../sidebar/SidebarThemeContext';



interface AutoActionSubmenuProps {
  state: AppState;
  fromId: AttackerId;
  onCreate: (annotation: ReturnType<typeof generateAutoAnnotation>) => void;
  onClose: () => void;
}

const SIDE_LABELS: Record<ScreenSide, string> = {
  gauche: '◀ gauche',
  droite: '▶ droite',
  devant: '▲ devant',
  dos: '▼ dos',
};

export function AutoActionSubmenu({ state, fromId, onCreate, onClose }: AutoActionSubmenuProps) {
  const [open, setOpen] = useState<'pass' | 'screen' | null>(null);
  const [screenTarget, setScreenTarget] = useState<AttackerId | null>(null);
  const { dark } = useSidebarTheme();

  const targets = getActiveAttackerIds(state.playerCount).filter((id) => id !== fromId);

  const submit = (kind: 'pass' | 'screen', toId: AttackerId, side?: ScreenSide) => {
    const ann = generateAutoAnnotation(kind, fromId, toId, side ? { side } : undefined, state);
    if (ann) onCreate(ann);
    onClose();
  };

  const headerBtnStyle = (active: boolean) => ({
    display: 'block' as const,
    width: '100%',
    textAlign: 'left' as const,
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 4,
    border: `1px solid ${active ? (dark ? 'rgba(253, 186, 116, 0.35)' : 'rgba(234, 88, 12, 0.35)') : DARK_PANEL.border}`,
    background: active ? (dark ? 'rgba(216, 90, 48, 0.15)' : 'rgba(234, 88, 12, 0.10)') : DARK_PANEL.bgSubtle,
    color: active ? (dark ? '#fdba74' : '#c2410c') : DARK_PANEL.text,
    cursor: 'pointer' as const,
    fontWeight: active ? 600 : 400,
  });

  const subBtnStyle = {
    display: 'block' as const,
    width: '100%',
    textAlign: 'left' as const,
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 3,
    border: `1px solid ${DARK_PANEL.borderSubtle}`,
    background: DARK_PANEL.bg,
    color: DARK_PANEL.textMuted,
    cursor: 'pointer' as const,
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        action auto
      </div>

      <button
        onClick={() => setOpen(open === 'pass' ? null : 'pass')}
        style={headerBtnStyle(open === 'pass')}
      >
        passer vers… {open === 'pass' ? '▾' : '▸'}
      </button>
      {open === 'pass' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8 }}>
          {targets.map((toId) => (
            <button key={toId} onClick={() => submit('pass', toId)} style={subBtnStyle}>
              → {toId}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          setOpen(open === 'screen' ? null : 'screen');
          setScreenTarget(null);
        }}
        style={headerBtnStyle(open === 'screen')}
      >
        écran pour… {open === 'screen' ? '▾' : '▸'}
      </button>
      {open === 'screen' && screenTarget === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8 }}>
          {targets.map((toId) => (
            <button key={toId} onClick={() => setScreenTarget(toId)} style={subBtnStyle}>
              {toId} ▸
            </button>
          ))}
        </div>
      )}
      {open === 'screen' && screenTarget !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', paddingLeft: 2 }}>
            côté de {screenTarget}
          </div>
          {(Object.keys(SIDE_LABELS) as ScreenSide[]).map((side) => (
            <button key={side} onClick={() => submit('screen', screenTarget, side)} style={subBtnStyle}>
              {SIDE_LABELS[side]}
            </button>
          ))}
          <button
            onClick={() => setScreenTarget(null)}
            style={{ ...subBtnStyle, color: DARK_PANEL.textDim }}
          >
            ← retour
          </button>
        </div>
      )}
    </div>
  );
}
