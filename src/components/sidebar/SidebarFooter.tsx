'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SIDEBAR } from './tokens';

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  version?: string;
};

export function SidebarFooter({ collapsed, onToggleCollapse, version }: Props) {
  return (
    <div
      style={{
        borderTop: `1px solid ${SIDEBAR.borderSubtle}`,
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
      }}
    >
      {!collapsed && version && (
        <span style={{ fontSize: 11, color: SIDEBAR.textDim, fontWeight: 500 }}>v{version}</span>
      )}
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
        aria-label={collapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
        style={{
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 6,
          background: 'transparent',
          color: SIDEBAR.textMuted,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = SIDEBAR.bgHover;
          e.currentTarget.style.color = SIDEBAR.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = SIDEBAR.textMuted;
        }}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
    </div>
  );
}
