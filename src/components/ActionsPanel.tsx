'use client';

import { Panel } from './ui';

interface ActionsPanelProps {
  presentMode: boolean;
  onTogglePresentMode: () => void;
  onOpenPlaybook: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}

/**
 * Bloc compact en haut de la colonne gauche, regroupant les actions
 * globales (anciennement dans le header). Boutons full-width empilés.
 */
export function ActionsPanel(props: ActionsPanelProps) {
  return (
    <Panel theme="neutral" title="🏀 Actions">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ActionButton
          onClick={props.onTogglePresentMode}
          active={props.presentMode}
          activeColor="#1e40af"
          label={props.presentMode ? '✕ quitter plein écran' : '🎬 plein écran'}
          title="Masque les panneaux pour donner toute la place au terrain (Échap pour quitter)"
        />
        <ActionButton onClick={props.onOpenPlaybook} label="📄 playbook PDF" />
        <ActionButton onClick={props.onExport} label="exporter JSON" />
        <ActionButton onClick={props.onImport} label="importer JSON" />
        <ActionButton
          onClick={props.onReset}
          label="reset complet"
          color="#b91c1c"
        />
      </div>
    </Panel>
  );
}

function ActionButton({
  onClick, label, title, color, active, activeColor,
}: {
  onClick: () => void;
  label: string;
  title?: string;
  color?: string;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        border: `1px solid ${active && activeColor ? activeColor : '#e2e8f0'}`,
        background: active && activeColor ? activeColor : '#fff',
        cursor: 'pointer',
        color: active && activeColor ? '#fff' : (color ?? '#334155'),
        fontWeight: 500,
        textAlign: 'left',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        transition: 'border-color 120ms, background 120ms',
      }}
    >
      {label}
    </button>
  );
}
