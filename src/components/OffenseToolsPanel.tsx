'use client';

import type { ActionTimingAnchor, Tool } from '@/lib/types';
import type { StickyModifiers } from '@/hooks/useCourtPointerHandlers';
import { Panel, Section, COLORS } from './ui';
import { useSidebarTheme, DARK_PANEL } from './sidebar/SidebarThemeContext';
import { TOOL_KEYS } from '@/hooks/useKeyboardShortcuts';

interface OffenseToolsPanelProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  actionTimingAnchor?: ActionTimingAnchor;
  onSetActionTimingAnchor?: (mode: ActionTimingAnchor) => void;
  onApplyStartingFormation?: (formationId: string) => void;
  onOpenComposer?: () => void;
  modifiers?: StickyModifiers;
  onChangeModifiers?: (next: StickyModifiers) => void;
}

const shortcutKeyFor = (tool: Tool): string =>
  (Object.keys(TOOL_KEYS).find((k) => TOOL_KEYS[k] === tool) ?? '').toUpperCase();

const TOOLS: { value: Tool; label: string }[] = [
  { value: 'move', label: 'déplacer' },
  { value: 'pass', label: 'passe' },
  { value: 'dribble', label: 'dribble' },
  { value: 'cut', label: 'course' },
  { value: 'screen', label: 'écran' },
  { value: 'text', label: 'note' },
];

function ToolIcon({ tool, color }: { tool: Tool; color: string }) {
  switch (tool) {
    case 'move':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 2 v12 M2 8 h12 M5 5 L2 8 L5 11 M11 5 L14 8 L11 11 M5 5 L8 2 L11 5 M5 11 L8 14 L11 11" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'pass':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <line x1="1" y1="5" x2="16" y2="5" stroke={color} strokeWidth="1.6" strokeDasharray="2 2.5" strokeLinecap="round" />
          <path d="M15 1 L20 5 L15 9" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'dribble':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <path d="M1 5 Q3 0 5 5 T9 5 T13 5 T17 5" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M16 1 L20 5 L16 9" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'cut':
      return (
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <line x1="1" y1="5" x2="16" y2="5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M15 1 L20 5 L15 9" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'text':
      return (
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
          <rect x={1} y={2} width={14} height={12} rx={2}
                fill="none" stroke={color} strokeWidth={1.5}/>
          <text x={8} y={11} textAnchor="middle"
                fontSize={9} fontWeight={700} fill={color}>T</text>
        </svg>
      );
    case 'screen':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="11" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="3" y1="12" x2="13" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

/**
 * Refonte UI Livraison 1 — panneau gauche colonne tactique :
 * outils d'édition (déplacer / passe / dribble / course / écran).
 *
 * La liste des étapes a été extraite dans `StepsPanel` (colonne droite).
 */
export function OffenseToolsPanel(props: OffenseToolsPanelProps) {
  const c = COLORS.offense;
  const { dark } = useSidebarTheme();
  const idleBg = dark ? DARK_PANEL.bgSubtle : '#fff';
  const idleBorder = dark ? DARK_PANEL.border : c.border;
  const idleText = dark ? DARK_PANEL.text : c.accentText;
  const actionTimingAnchor = props.actionTimingAnchor ?? 'start';
  return (
    <Panel theme="offense" title="⚪ Attaque">
      <Section theme="offense" label="Actions" open>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {TOOLS.map((t) => {
            const active = props.tool === t.value;
            return (
              <button
                key={t.value}
                onClick={() => props.onSetTool(t.value)}
                title={`Outil ${t.label} (touche ${shortcutKeyFor(t.value)})`}
                aria-pressed={active}
                className="bt-touch"
                style={{
                  flex: '1 0 calc(33% - 4px)',
                  fontSize: 11,
                  padding: '6px 6px',
                  borderRadius: 6,
                  border: `1px solid ${active ? c.accent : idleBorder}`,
                  background: active ? '#c2410c' : idleBg,
                  color: active ? '#fff' : idleText,
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <ToolIcon tool={t.value} color={active ? '#fff' : idleText} />
                {t.label}
              </button>
            );
          })}
        </div>
        {props.onOpenComposer && (
          <button
            type="button"
            className="bt-touch"
            onClick={props.onOpenComposer}
            title="Orchestrateur tactique d'étape : définir les actions combinées (écrans, coupes, passes) en 1 clic sans dessiner"
            style={{
              width: '100%',
              marginTop: 8,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid rgba(234, 88, 12, 0.45)',
              background: 'linear-gradient(180deg, rgba(234, 88, 12, 0.22) 0%, rgba(194, 65, 12, 0.28) 100%)',
              color: '#fb923c',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>⚡ Orchestrer l'étape</span>
          </button>
        )}
        {props.onSetActionTimingAnchor && (
          <label
            title="Coché : le tracé arrive au moment courant de la timeline. Décoché : il démarre au moment courant."
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginTop: 8,
              padding: '6px 8px',
              borderRadius: 6,
              border: `1px solid ${actionTimingAnchor === 'end' ? c.accent : idleBorder}`,
              background: actionTimingAnchor === 'end'
                ? (dark ? 'rgba(216, 90, 48, 0.18)' : '#fff7ed')
                : idleBg,
              color: actionTimingAnchor === 'end' ? c.accentText : idleText,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span>fin d'action</span>
            <input
              type="checkbox"
              checked={actionTimingAnchor === 'end'}
              onChange={(e) => props.onSetActionTimingAnchor?.(e.target.checked ? 'end' : 'start')}
            />
          </label>
        )}
        {props.onChangeModifiers && props.modifiers && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              className="bt-touch"
              onClick={() => props.onChangeModifiers?.({ ...props.modifiers, multiSelect: !props.modifiers?.multiSelect })}
              title="Sélectionner plusieurs joueurs pour les déplacer ou leur assigner une règle ensemble (équivalent Maj)"
              style={{
                padding: '6px 4px',
                borderRadius: 6,
                border: `1px solid ${props.modifiers.multiSelect ? c.accent : idleBorder}`,
                background: props.modifiers.multiSelect ? (dark ? 'rgba(216, 90, 48, 0.25)' : '#ffedd5') : idleBg,
                color: props.modifiers.multiSelect ? c.accentText : idleText,
                fontSize: 11,
                fontWeight: props.modifiers.multiSelect ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              🔗 Multi-sélection
            </button>
            <button
              type="button"
              className="bt-touch"
              onClick={() => props.onChangeModifiers?.({ ...props.modifiers, snap: !props.modifiers?.snap })}
              title="Aimanter les joueurs aux repères géométriques clés du terrain (équivalent Ctrl/⌘)"
              style={{
                padding: '6px 4px',
                borderRadius: 6,
                border: `1px solid ${props.modifiers.snap ? c.accent : idleBorder}`,
                background: props.modifiers.snap ? (dark ? 'rgba(216, 90, 48, 0.25)' : '#ffedd5') : idleBg,
                color: props.modifiers.snap ? c.accentText : idleText,
                fontSize: 11,
                fontWeight: props.modifiers.snap ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              🧲 Aimanter
            </button>
          </div>
        )}
      </Section>

      {props.onApplyStartingFormation && (
        <Section theme="offense" label="Formations de départ (1 clic)" open>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              { id: '5-out', label: '5-Out Open' },
              { id: '4-out-1-in', label: '4-Out 1-In' },
              { id: 'horns', label: 'Horns (Cornes)' },
              { id: '1-4-high', label: '1-4 High' },
              { id: '1-4-low', label: '1-4 Low' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className="bt-touch"
                onClick={() => props.onApplyStartingFormation?.(f.id)}
                title={`Disposer instantanément l'équipe en ${f.label}`}
                style={{
                  fontSize: 11,
                  padding: '6px 4px',
                  borderRadius: 5,
                  border: `1px solid ${idleBorder}`,
                  background: idleBg,
                  color: idleText,
                  cursor: 'pointer',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Section>
      )}
    </Panel>
  );
}
