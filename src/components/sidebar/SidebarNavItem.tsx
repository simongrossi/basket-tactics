'use client';

import type { LucideIcon } from 'lucide-react';
import { SIDEBAR } from './tokens';

type Props = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  onClick: () => void;
};

export function SidebarNavItem({ icon: Icon, label, active = false, collapsed = false, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        height: SIDEBAR.itemHeight,
        padding: collapsed ? `0` : `0 10px`,
        justifyContent: collapsed ? 'center' : 'flex-start',
        border: 'none',
        background: active ? SIDEBAR.accentBg : 'transparent',
        color: active ? SIDEBAR.text : SIDEBAR.textMuted,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        borderRadius: 6,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 120ms ease, color 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = SIDEBAR.bgHover;
        e.currentTarget.style.color = SIDEBAR.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? SIDEBAR.accentBg : 'transparent';
        e.currentTarget.style.color = active ? SIDEBAR.text : SIDEBAR.textMuted;
      }}
    >
      <Icon size={SIDEBAR.iconSize} strokeWidth={2} style={{ flexShrink: 0, color: active ? SIDEBAR.accent : 'inherit' }} />
      {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  );
}
