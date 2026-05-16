'use client';

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
};

export function Sidebar({
  activeView,
  collapsed,
  onSelectView,
  onToggleCollapse,
  version,
  toolGroups,
  overflowMenu,
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
        On cible les inputs et selects (déterministe via type), et les
        patterns de fond blanc inline pour les boutons / éléments génériques.
        Les couleurs d'accent (orange/bleu) restent intactes — elles
        fonctionnent sur dark.
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-tools-scope .sidebar-tool-section:last-of-type {
          border-bottom: none !important;
        }
        .sidebar-tools-scope select,
        .sidebar-tools-scope input[type="text"],
        .sidebar-tools-scope input[type="number"],
        .sidebar-tools-scope input[type="search"],
        .sidebar-tools-scope textarea {
          background: ${SIDEBAR.bgActive} !important;
          color: ${SIDEBAR.text} !important;
          border-color: ${SIDEBAR.border} !important;
        }
        .sidebar-tools-scope input::placeholder,
        .sidebar-tools-scope textarea::placeholder {
          color: ${SIDEBAR.textDim} !important;
        }
        .sidebar-tools-scope [style*="rgb(255, 255, 255)"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="background: #fff"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="background:#fff"]:not(input):not(select):not(textarea) {
          background: ${SIDEBAR.bgActive} !important;
        }
        .sidebar-tools-scope [style*="color: rgb(71, 85, 105)"],
        .sidebar-tools-scope [style*="color: #475569"],
        .sidebar-tools-scope [style*="color:#475569"],
        .sidebar-tools-scope [style*="color: rgb(100, 116, 139)"],
        .sidebar-tools-scope [style*="color: #64748b"],
        .sidebar-tools-scope [style*="color: rgb(51, 65, 85)"],
        .sidebar-tools-scope [style*="color: #334155"],
        .sidebar-tools-scope [style*="color: rgb(31, 41, 55)"],
        .sidebar-tools-scope [style*="color: #1f2937"] {
          color: ${SIDEBAR.text} !important;
        }
        .sidebar-tools-scope [style*="color: rgb(120, 113, 108)"],
        .sidebar-tools-scope [style*="color: #78716c"],
        .sidebar-tools-scope [style*="color: rgb(148, 163, 184)"],
        .sidebar-tools-scope [style*="color: #94a3b8"] {
          color: ${SIDEBAR.textMuted} !important;
        }
        /* Bordures pâles fréquentes */
        .sidebar-tools-scope [style*="border: 1px solid rgb(203, 213, 225)"],
        .sidebar-tools-scope [style*="border: 1px solid #cbd5e1"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(226, 232, 240)"],
        .sidebar-tools-scope [style*="border: 1px solid #e2e8f0"] {
          border-color: ${SIDEBAR.border} !important;
        }
        /* Backgrounds gris pâles utilisés pour les zones repliées / passives */
        .sidebar-tools-scope [style*="background: rgb(241, 245, 249)"],
        .sidebar-tools-scope [style*="background: #f1f5f9"],
        .sidebar-tools-scope [style*="background: rgb(248, 250, 252)"],
        .sidebar-tools-scope [style*="background: #f8fafc"],
        .sidebar-tools-scope [style*="background: rgb(250, 250, 249)"],
        .sidebar-tools-scope [style*="background: #fafaf9"] {
          background: ${SIDEBAR.bg} !important;
        }
        /* Bordures saturées (rouge BLOB, ambre LF, vert LF+, violet jump ball)
           → neutralisées en bordure dark subtile. Évite l'effet "alarmes
           colorées" sur fond sombre. */
        .sidebar-tools-scope [style*="border: 1px solid rgb(220, 38, 38)"],
        .sidebar-tools-scope [style*="border: 1px solid #dc2626"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(245, 158, 11)"],
        .sidebar-tools-scope [style*="border: 1px solid #f59e0b"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(16, 185, 129)"],
        .sidebar-tools-scope [style*="border: 1px solid #10b981"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(124, 58, 237)"],
        .sidebar-tools-scope [style*="border: 1px solid #7c3aed"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(216, 90, 48)"],
        .sidebar-tools-scope [style*="border: 1px solid #D85A30"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(55, 138, 221)"],
        .sidebar-tools-scope [style*="border: 1px solid #378ADD"] {
          border-color: ${SIDEBAR.border} !important;
        }
        /* Textes saturés (rouge foncé, ambre foncé, vert foncé, violet foncé)
           → texte light pour lisibilité sur dark. */
        .sidebar-tools-scope [style*="color: rgb(127, 29, 29)"],
        .sidebar-tools-scope [style*="color: #7f1d1d"],
        .sidebar-tools-scope [style*="color: rgb(146, 64, 14)"],
        .sidebar-tools-scope [style*="color: #92400e"],
        .sidebar-tools-scope [style*="color: rgb(6, 95, 70)"],
        .sidebar-tools-scope [style*="color: #065f46"],
        .sidebar-tools-scope [style*="color: rgb(91, 33, 182)"],
        .sidebar-tools-scope [style*="color: #5b21b6"],
        .sidebar-tools-scope [style*="color: rgb(124, 45, 18)"],
        .sidebar-tools-scope [style*="color: #7c2d12"],
        .sidebar-tools-scope [style*="color: rgb(30, 58, 138)"],
        .sidebar-tools-scope [style*="color: #1e3a8a"] {
          color: ${SIDEBAR.text} !important;
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
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
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
            <SidebarThemeProvider dark>
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
