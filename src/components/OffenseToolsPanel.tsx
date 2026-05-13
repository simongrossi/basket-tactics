'use client';

import type { Tool } from '@/lib/types';
import { Panel, Section, COLORS } from './ui';

interface OffenseToolsPanelProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
}

const TOOLS: { value: Tool; label: string }[] = [
  { value: 'move', label: 'déplacer' },
  { value: 'pass', label: 'passe' },
  { value: 'dribble', label: 'dribble' },
  { value: 'cut', label: 'course' },
  { value: 'screen', label: 'écran' },
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
                style={{
                  flex: '1 0 calc(33% - 4px)',
                  fontSize: 11,
                  padding: '6px 6px',
                  borderRadius: 6,
                  border: `1px solid ${active ? c.accent : c.border}`,
                  background: active ? c.accent : '#fff',
                  color: active ? '#fff' : c.accentText,
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <ToolIcon tool={t.value} color={active ? '#fff' : c.accentText} />
                {t.label}
              </button>
            );
          })}
        </div>
      </Section>
    </Panel>
  );
}
