'use client';

import { InterfaceLevelSelector } from '../interface/InterfaceLevel';
import type { ReactNode } from 'react';
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
        html[data-theme="light"] .sidebar-tools-scope button[style*="color: #fbbf24"],
        html[data-theme="light"] .sidebar-tools-scope button[style*="color: #fcd34d"] {
          color: #b45309 !important;
        }
      `}} />
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

      {/* Tout le contenu sous le logo défile d'un bloc : sur un écran de
          768 px de haut, les entrées + vues laissaient ~30 px aux outils
          (Attaque / Étapes introuvables). Les outils gardent désormais leur
          hauteur naturelle et le pied reste fixe. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <InterfaceLevelSelector compact={collapsed} />
      {startActions}
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
            {!collapsed && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: SIDEBAR.textDim,
                  textTransform: 'uppercase',
                  padding: '4px 10px 6px',
                }}
              >
                Outils
              </div>
            )}
            <SidebarThemeProvider dark={dark}>
              {toolGroups!.map((g) => (
                <SidebarToolGroup
                  key={g.id}
                  id={g.id}
                  icon={g.icon}
                  label={g.label}
                  accent={g.accent}
                  defaultOpen={g.defaultOpen}
                  collapsed={collapsed}
                >
                  {g.content}
                </SidebarToolGroup>
              ))}
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
