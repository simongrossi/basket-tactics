// Barre d'outils du context menu : sélection de l'outil actif (move/pass/
// dribble/cut/screen). Identique pour défenseur et attaquant — sur un
// défenseur, les outils non-applicables sont grisés mais restent cliquables
// (l'outil est un mode global, pas un mode joueur).

import type { Tool } from '@/lib/types';
import { DARK_PANEL } from '../sidebar/SidebarThemeContext';

export interface ToolBarProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  /** Si true (défenseur), on grise les outils qui ne s'appliquent pas
   *  (passe/dribble/course/écran). L'outil reste cliquable car il définit le
   *  mode global pour les prochaines actions sur les attaquants. */
  defenderContext?: boolean;
}

const TOOL_DEFS: { value: Tool; label: string; symbol: string }[] = [
  { value: 'move', label: 'déplacer', symbol: '✥' },
  { value: 'pass', label: 'passe', symbol: '⇢' },
  { value: 'dribble', label: 'dribble', symbol: '∿' },
  { value: 'cut', label: 'course', symbol: '→' },
  { value: 'screen', label: 'écran', symbol: '⊥' },
];

export function ToolBar({ tool, onSetTool, defenderContext }: ToolBarProps) {
  return (
    <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
      {TOOL_DEFS.map((t) => {
        const active = tool === t.value;
        const greyed = defenderContext && t.value !== 'move';
        return (
          <button
            key={t.value}
            onClick={() => onSetTool(t.value)}
            title={t.label + (greyed ? ' — applicable aux attaquants seulement' : '')}
            style={{
              flex: '1 1 auto',
              fontSize: 10,
              padding: '4px 2px',
              borderRadius: 4,
              border: `1px solid ${active ? '#D85A30' : DARK_PANEL.border}`,
              background: active ? '#D85A30' : DARK_PANEL.bgSubtle,
              color: active ? '#fff' : (greyed ? DARK_PANEL.textDim : '#fdba74'),
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: 12 }}>{t.symbol}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
