// Barre d'outils du context menu : sélection de l'outil actif (move/pass/
// dribble/cut/screen). Identique pour défenseur et attaquant — sur un
// défenseur, les outils non-applicables sont grisés mais restent cliquables
// (l'outil est un mode global, pas un mode joueur).

import type { Tool } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import { Move, PanelTop, Route, SendHorizontal, Waves } from 'lucide-react';
import { DARK_PANEL } from '../sidebar/SidebarThemeContext';

export interface ToolBarProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  /** Si true (défenseur), on grise les outils qui ne s'appliquent pas
   *  (passe/dribble/course/écran). L'outil reste cliquable car il définit le
   *  mode global pour les prochaines actions sur les attaquants. */
  defenderContext?: boolean;
}

const TOOL_DEFS: { value: Tool; label: string; Icon: LucideIcon }[] = [
  { value: 'move', label: 'déplacer', Icon: Move },
  { value: 'pass', label: 'passe', Icon: SendHorizontal },
  { value: 'dribble', label: 'dribble', Icon: Waves },
  { value: 'cut', label: 'course', Icon: Route },
  { value: 'screen', label: 'écran', Icon: PanelTop },
];

export function ToolBar({ tool, onSetTool, defenderContext }: ToolBarProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
      {TOOL_DEFS.map((t) => {
        const active = tool === t.value;
        const greyed = defenderContext && t.value !== 'move';
        const Icon = t.Icon;
        return (
          <button
            type="button"
            key={t.value}
            onClick={() => onSetTool(t.value)}
            aria-label={t.label + (greyed ? ' — applicable aux attaquants seulement' : '')}
            style={{
              minWidth: 0,
              minHeight: 48,
              fontSize: 12,
              padding: '7px 4px',
              borderRadius: 8,
              border: `1px solid ${active ? '#D85A30' : DARK_PANEL.border}`,
              background: active
                ? 'linear-gradient(180deg, #e46338 0%, #c94a23 100%)'
                : DARK_PANEL.bgSubtle,
              color: active ? '#fff' : (greyed ? DARK_PANEL.textDim : '#fdba74'),
              cursor: 'pointer',
              fontWeight: active ? 800 : 700,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              lineHeight: 1.1,
              boxShadow: active ? '0 8px 18px rgba(216, 90, 48, 0.24)' : 'none',
            }}
          >
            <Icon size={16} strokeWidth={2.4} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
