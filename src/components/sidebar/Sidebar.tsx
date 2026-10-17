'use client';

import { InterfaceLevelSelector } from '../interface/InterfaceLevel';
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SidebarView } from '@/hooks/useSidebarState';
import { SIDEBAR } from './tokens';
import { SidebarNav } from './SidebarNav';
import { SidebarFooter } from './SidebarFooter';
import { SidebarThemeProvider } from './SidebarThemeContext';
import { SidebarToolGroup } from './SidebarToolGroup';

export type ToolGroup = {
  id: string;
  icon: LucideIcon;
  label: string;
  accent?: string;
  defaultOpen?: boolean;
  content: ReactNode;
};

type Props = {
  activeView: SidebarView;
  collapsed: boolean;
  onSelectView: (view: SidebarView) => void;
  onToggleCollapse: () => void;
  version?: string;
  /**
   * Liste des groupes d'outils contextuels (Attaque, Défense, Étapes,
   * Scénario). Chaque groupe = un item dépliable de la sidebar, visuellement
   * cohérent avec les items de Vues du dessus.
   * Rendu uniquement quand activeView === 'court'.
   */
  toolGroups?: ToolGroup[];
  /** Slot pour le menu ⋯ d'actions globales (cf. SidebarOverflowMenu). */
  overflowMenu?: ReactNode;
  startActions?: ReactNode;
  dark?: boolean;
};

export function Sidebar({
  activeView,
  collapsed,
  onSelectView,
  onToggleCollapse,
  version,
  toolGroups,
  overflowMenu,
  startActions,
  dark = true,
}: Props) {
  const [activeToolTab, setActiveToolTab] = useState<string>(() => {
    try {
      return localStorage.getItem('bt_active_tool_tab') || 'offense';
    } catch {
      return 'offense';
    }
  });

  const handleSelectTab = (id: string) => {
    setActiveToolTab(id);
    try {
      localStorage.setItem('bt_active_tool_tab', id);
    } catch {}
  };

  const hasTools = toolGroups != null && toolGroups.length > 0;
  const showTools = activeView === 'court' && hasTools;

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
      {/*
        Override scoped pour les éléments stylés inline dans les panneaux
        Offense/Defense/Steps/Scenario qui n'utilisent pas SidebarThemeContext.
        En dark mode, on neutralise les fonds blancs / textes sombres.
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-tools-scope .sidebar-tool-section:last-of-type {
          border-bottom: none !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope select,
        html:not([data-theme="light"]) .sidebar-tools-scope input[type="text"],
        html:not([data-theme="light"]) .sidebar-tools-scope input[type="number"],
        html:not([data-theme="light"]) .sidebar-tools-scope input[type="search"],
        html:not([data-theme="light"]) .sidebar-tools-scope textarea {
          background: ${SIDEBAR.bgActive} !important;
          color: ${SIDEBAR.text} !important;
          border-color: ${SIDEBAR.border} !important;
          max-width: 100% !important;
          box-sizing: border-box;
        }
        /* Évite que les rows flex (select + label) débordent au-delà de la
           largeur de la sidebar quand un contenu intrinsèque est trop large. */
        .sidebar-tools-scope > * {
          max-width: 100%;
        }
        .sidebar-tools-scope > * > * {
          max-width: 100%;
          box-sizing: border-box;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope input::placeholder,
        html:not([data-theme="light"]) .sidebar-tools-scope textarea::placeholder {
          color: ${SIDEBAR.textDim} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="rgb(255, 255, 255)"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="rgb(255,255,255)"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #fff"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background:#fff"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #FFFFFF"]:not(input):not(select):not(textarea),
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #ffffff"]:not(input):not(select):not(textarea) {
          background: ${SIDEBAR.bgActive} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(255, 247, 237)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #fff7ed"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(255, 237, 213)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #ffedd5"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(239, 246, 255)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #eff6ff"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(219, 234, 254)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #dbeafe"] {
          background: ${SIDEBAR.bgActive} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(71, 85, 105)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #475569"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color:#475569"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(100, 116, 139)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #64748b"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(51, 65, 85)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #334155"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(31, 41, 55)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #1f2937"] {
          color: ${SIDEBAR.text} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(120, 113, 108)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #78716c"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(148, 163, 184)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #94a3b8"] {
          color: ${SIDEBAR.textMuted} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(203, 213, 225)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #cbd5e1"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(226, 232, 240)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #e2e8f0"] {
          border-color: ${SIDEBAR.border} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(241, 245, 249)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #f1f5f9"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(248, 250, 252)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #f8fafc"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: rgb(250, 250, 249)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="background: #fafaf9"] {
          background: ${SIDEBAR.bg} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(220, 38, 38)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #dc2626"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(245, 158, 11)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #f59e0b"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(16, 185, 129)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #10b981"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(124, 58, 237)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #7c3aed"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(216, 90, 48)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #D85A30"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(55, 138, 221)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #378ADD"] {
          border-color: ${SIDEBAR.border} !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(127, 29, 29)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #7f1d1d"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(153, 27, 27)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #991b1b"] {
          color: #fca5a5 !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(146, 64, 14)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #92400e"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(180, 83, 9)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #b45309"] {
          color: #fbbf24 !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(6, 95, 70)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #065f46"] {
          color: #6ee7b7 !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(91, 33, 182)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #5b21b6"] {
          color: #c4b5fd !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(124, 45, 18)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #7c2d12"] {
          color: #fdba74 !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(30, 58, 138)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #1e3a8a"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: rgb(30, 64, 175)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="color: #1e40af"] {
          color: #93c5fd !important;
        }
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(167, 243, 208)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #a7f3d0"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(253, 230, 138)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #fde68a"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid rgb(254, 202, 202)"],
        html:not([data-theme="light"]) .sidebar-tools-scope [style*="border: 1px solid #fecaca"] {
          border-color: ${SIDEBAR.border} !important;
        }

        /* En mode clair : neutraliser les boutons hardcodés avec fond sombre #262a32 / #20252e */
        html[data-theme="light"] .sidebar-tools-scope [style*="background: #262a32"],
        html[data-theme="light"] .sidebar-tools-scope [style*="background:#262a32"],
        html[data-theme="light"] .sidebar-tools-scope [style*="background: rgb(38, 42, 50)"],
        html[data-theme="light"] .sidebar-tools-scope [style*="background: #29313e"],
        html[data-theme="light"] .sidebar-tools-scope [style*="background: #20252e"],
        html[data-theme="light"] .sidebar-tools-scope [style*="background: #1f242c"] {
          background: #ffffff !important;
          color: #1e293b !important;
          border-color: #cbd5e1 !important;
        }
        html[data-theme="light"] .sidebar-tools-scope [style*="background: rgba(252, 165, 165, 0.10)"],
        html[data-theme="light"] .sidebar-tools-scope [style*="background: rgba(252, 165, 165, 0.1)"] {
          background: #fef2f2 !important;
          color: #dc2626 !important;
          border-color: #fca5a5 !important;
        }
        html[data-theme="light"] .sidebar-tools-scope button[style*="color: #cbd5e1"],
        html[data-theme="light"] .sidebar-tools-scope button[style*="color:#cbd5e1"] {
          color: #334155 !important;
        }
        html[data-theme="light"] .sidebar-tools-scope button[style*="color: #86efac"] {
          color: #15803d !important;
        }
        html[data-theme="light"] .sidebar-tools-scope button[style*="color: #fca5a5"] {
          color: #b91c1c !important;
        }
        html[data-theme="light"] .sidebar-tools-scope button[style*="color: #c4b5fd"] {
          color: #6d28d9 !important;
        }
        /* Scrollbar moderne et discrète pour le volet gauche */
        .sidebar-scroll-area {
          scrollbar-width: thin;
          scrollbar-color: var(--bt-border) transparent;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }
        .sidebar-scroll-area::-webkit-scrollbar {
          width: 5px;
        }
        .sidebar-scroll-area::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scroll-area::-webkit-scrollbar-thumb {
          background: var(--bt-border);
          border-radius: 4px;
        }
        .sidebar-scroll-area::-webkit-scrollbar-thumb:hover {
          background: var(--bt-text-dim);
        }
      `}} />

      {/* Tout le contenu sous le logo défile d'un bloc : sur un écran de
          768 px de haut, les entrées + vues laissaient ~30 px aux outils
          (Attaque / Étapes introuvables). Les outils gardent désormais leur
          hauteur naturelle et le pied reste fixe. */}
      <div className="sidebar-scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 4 }}>
      <InterfaceLevelSelector compact={collapsed} />
      {startActions}
      <div style={{ padding: '6px 0 4px', flexShrink: 0 }}>
        <SidebarNav activeView={activeView} collapsed={collapsed} onSelect={onSelectView} />
      </div>

      {showTools && (
        <>
          <div
            style={{
              height: 1,
              background: SIDEBAR.borderSubtle,
              margin: '4px 12px 6px',
              flexShrink: 0,
            }}
          />
          <div
            className="sidebar-tools-scope"
            style={{
              flex: '1 0 auto',
              overflowX: 'hidden',
              padding: '0 6px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <SidebarThemeProvider dark={dark}>
              {!collapsed ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
                  {/* Onglets rapides pour naviguer entre Attaque, Défense, Étapes, Scénario (Sticky) */}
                  <div
                    role="tablist"
                    aria-label="Sélecteur d'outils"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 3,
                      background: SIDEBAR.bgHover,
                      padding: 3,
                      borderRadius: 7,
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                    }}
                  >
                    {toolGroups!.map((g) => {
                      const isActive = activeToolTab === g.id;
                      const Icon = g.icon;
                      return (
                        <button
                          key={g.id}
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => handleSelectTab(g.id)}
                          title={g.label}
                          className="bt-touch"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 2,
                            padding: '6px 2px',
                            borderRadius: 5,
                            border: 'none',
                            background: isActive ? SIDEBAR.bgActive : 'transparent',
                            color: isActive ? SIDEBAR.text : SIDEBAR.textMuted,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: isActive ? 700 : 500,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Icon size={14} style={{ color: isActive ? (g.accent ?? 'inherit') : 'inherit' }} />
                          <span style={{ fontSize: 9, lineHeight: 1 }}>{g.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Contenu du groupe d'outils actif */}
                  {(() => {
                    const activeGroup = toolGroups!.find((g) => g.id === activeToolTab) ?? toolGroups![0];
                    if (!activeGroup) return null;
                    return (
                      <div
                        role="tabpanel"
                        id={`tool-panel-${activeGroup.id}`}
                        style={{
                          padding: '4px 2px 48px',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {activeGroup.content}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {toolGroups!.map((g) => {
                    const isActive = activeToolTab === g.id;
                    const Icon = g.icon;
                    return (
                      <button
                        key={g.id}
                        onClick={() => {
                          handleSelectTab(g.id);
                          onToggleCollapse();
                        }}
                        title={`${g.label} (cliquez pour ouvrir)`}
                        className="bt-touch"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          height: SIDEBAR.itemHeight,
                          border: 'none',
                          background: isActive ? SIDEBAR.bgActive : 'transparent',
                          color: isActive ? (g.accent ?? SIDEBAR.text) : SIDEBAR.textMuted,
                          cursor: 'pointer',
                          borderRadius: 6,
                        }}
                      >
                        <Icon size={SIDEBAR.iconSize} strokeWidth={2} />
                      </button>
                    );
                  })}
                </div>
              )}
            </SidebarThemeProvider>
          </div>
        </>
      )}

      {!showTools && <div style={{ flex: 1 }} />}
      </div>

      <SidebarFooter
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        version={version}
        overflowMenu={overflowMenu}
      />
    </aside>
  );
}

export function Logo() {
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
