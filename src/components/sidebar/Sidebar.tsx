'use client';

import type { ReactNode } from 'react';
import type { SidebarView } from '@/hooks/useSidebarState';
import { SIDEBAR } from './tokens';
import { SidebarNav } from './SidebarNav';
import { SidebarFooter } from './SidebarFooter';

type Props = {
  activeView: SidebarView;
  collapsed: boolean;
  onSelectView: (view: SidebarView) => void;
  onToggleCollapse: () => void;
  version?: string;
  /**
   * Contenu de la section "outils contextuels" (Offense, Defense, Steps,
   * Scenario). Rendu uniquement quand activeView === 'court'. La sidebar
   * elle-même ignore le contenu et se contente de le rendre dans son layout
   * dark, ce qui permet aux phases ultérieures de remplacer ce contenu par
   * des accordions sans toucher au chrome.
   */
  toolsContent?: ReactNode;
};

export function Sidebar({
  activeView,
  collapsed,
  onSelectView,
  onToggleCollapse,
  version,
  toolsContent,
}: Props) {
  const showTools = activeView === 'court' && !collapsed && toolsContent != null;

  return (
    <aside
      style={{
        background: SIDEBAR.bg,
        color: SIDEBAR.text,
        borderRight: `1px solid ${SIDEBAR.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 48,
          padding: collapsed ? 0 : '0 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: `1px solid ${SIDEBAR.borderSubtle}`,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.3,
          color: SIDEBAR.text,
          flexShrink: 0,
        }}
      >
        {collapsed ? <Logo /> : <><Logo /><span style={{ marginLeft: 10 }}>basket-tactics</span></>}
      </div>

      <div style={{ padding: '10px 0 6px', flexShrink: 0 }}>
        <SidebarNav activeView={activeView} collapsed={collapsed} onSelect={onSelectView} />
      </div>

      {showTools && (
        <>
          <div
            style={{
              height: 1,
              background: SIDEBAR.borderSubtle,
              margin: '6px 14px 10px',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '0 8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                color: SIDEBAR.textDim,
                textTransform: 'uppercase',
                padding: '0 6px 4px',
              }}
            >
              Outils
            </div>
            {toolsContent}
          </div>
        </>
      )}

      {!showTools && <div style={{ flex: 1 }} />}

      <SidebarFooter
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        version={version}
      />
    </aside>
  );
}

function Logo() {
  // Petit ballon stylisé (SVG inline) pour rester cohérent avec l'esprit du
  // projet et éviter d'ajouter un asset.
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#f97316',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c2d12" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2v20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
      </svg>
    </span>
  );
}
