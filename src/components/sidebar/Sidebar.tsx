'use client';

import type { ReactNode } from 'react';
import { PanelLeftClose, type LucideIcon } from 'lucide-react';
import { SIDEBAR } from './tokens';
import { SidebarThemeProvider } from './SidebarThemeContext';

export type ToolGroup = {
  id: string;
  icon: LucideIcon;
  /** Libellé court sous l'icône du rail. */
  label: string;
  /** Titre du panneau (par défaut : le libellé). */
  title?: string;
  accent?: string;
  content: ReactNode;
};

type Props = {
  /** Groupes d'outils : une icône du rail chacun, un seul panneau ouvert à la fois. */
  toolGroups: ToolGroup[];
  activeTool: string;
  /** Faux hors vue Terrain ou panneau replié : seul le rail reste affiché. */
  panelOpen: boolean;
  onSelectTool: (id: string) => void;
  onClosePanel: () => void;
  version?: string;
};

// Colonne de gauche : rail d'icônes + panneau contextuel du groupe choisi.
// Recliquer sur l'icône active replie le panneau pour agrandir le terrain.
export function Sidebar({ toolGroups, activeTool, panelOpen, onSelectTool, onClosePanel, version }: Props) {
  const active = toolGroups.find((g) => g.id === activeTool) ?? toolGroups[0];

  return (
    <aside className="bt-left" style={{ color: SIDEBAR.text }}>
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
        .sidebar-tools-scope input::placeholder,
        .sidebar-tools-scope textarea::placeholder {
          color: ${SIDEBAR.textDim} !important;
        }
        .sidebar-tools-scope [style*="rgb(255, 255, 255)"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="rgb(255,255,255)"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="background: #fff"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="background:#fff"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="background: #FFFFFF"]:not(input):not(select):not(textarea),
        .sidebar-tools-scope [style*="background: #ffffff"]:not(input):not(select):not(textarea) {
          background: ${SIDEBAR.bgActive} !important;
        }
        /* Cream backgrounds des thèmes accent (offense orange #fff7ed,
           defense bleu #eff6ff) — survivent à l'override blanc puisqu'ils
           NE sont pas blancs. Doivent passer aussi en dark pour cohérence
           (active step row dans StepsPanel, panneau pinned dans Defense). */
        .sidebar-tools-scope [style*="background: rgb(255, 247, 237)"],
        .sidebar-tools-scope [style*="background: #fff7ed"],
        .sidebar-tools-scope [style*="background: rgb(255, 237, 213)"],
        .sidebar-tools-scope [style*="background: #ffedd5"],
        .sidebar-tools-scope [style*="background: rgb(239, 246, 255)"],
        .sidebar-tools-scope [style*="background: #eff6ff"],
        .sidebar-tools-scope [style*="background: rgb(219, 234, 254)"],
        .sidebar-tools-scope [style*="background: #dbeafe"] {
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
        /* Textes saturés (rouge/ambre/vert/violet/orange/bleu foncés) →
           versions claires de la même teinte pour rester lisibles sur dark
           ET préserver le sens. */
        .sidebar-tools-scope [style*="color: rgb(127, 29, 29)"],
        .sidebar-tools-scope [style*="color: #7f1d1d"],
        .sidebar-tools-scope [style*="color: rgb(153, 27, 27)"],
        .sidebar-tools-scope [style*="color: #991b1b"] {
          color: #fca5a5 !important;
        }
        .sidebar-tools-scope [style*="color: rgb(146, 64, 14)"],
        .sidebar-tools-scope [style*="color: #92400e"],
        .sidebar-tools-scope [style*="color: rgb(180, 83, 9)"],
        .sidebar-tools-scope [style*="color: #b45309"] {
          color: #fbbf24 !important;
        }
        .sidebar-tools-scope [style*="color: rgb(6, 95, 70)"],
        .sidebar-tools-scope [style*="color: #065f46"] {
          color: #6ee7b7 !important;
        }
        .sidebar-tools-scope [style*="color: rgb(91, 33, 182)"],
        .sidebar-tools-scope [style*="color: #5b21b6"] {
          color: #c4b5fd !important;
        }
        .sidebar-tools-scope [style*="color: rgb(124, 45, 18)"],
        .sidebar-tools-scope [style*="color: #7c2d12"] {
          color: #fdba74 !important;
        }
        .sidebar-tools-scope [style*="color: rgb(30, 58, 138)"],
        .sidebar-tools-scope [style*="color: #1e3a8a"],
        .sidebar-tools-scope [style*="color: rgb(30, 64, 175)"],
        .sidebar-tools-scope [style*="color: #1e40af"] {
          color: #93c5fd !important;
        }
        /* Bordures pastel chips (vert clair, ambre clair, rouge clair) */
        .sidebar-tools-scope [style*="border: 1px solid rgb(167, 243, 208)"],
        .sidebar-tools-scope [style*="border: 1px solid #a7f3d0"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(253, 230, 138)"],
        .sidebar-tools-scope [style*="border: 1px solid #fde68a"],
        .sidebar-tools-scope [style*="border: 1px solid rgb(254, 202, 202)"],
        .sidebar-tools-scope [style*="border: 1px solid #fecaca"] {
          border-color: ${SIDEBAR.border} !important;
        }
      `}} />
      <nav className="bt-rail" aria-label="Outils">
        {toolGroups.map((g) => {
          const pressed = panelOpen && g.id === active?.id;
          return (
            <button
              key={g.id}
              type="button"
              className="bt-rail-item"
              aria-pressed={pressed}
              title={g.title ?? g.label}
              onClick={() => (pressed ? onClosePanel() : onSelectTool(g.id))}
            >
              <g.icon size={19} strokeWidth={1.9} style={{ color: pressed ? g.accent : undefined }} aria-hidden />
              <span>{g.label}</span>
            </button>
          );
        })}
        {version && <span className="bt-rail-version">v{version}</span>}
      </nav>

      {panelOpen && active && (
        <section className="bt-panel" aria-label={active.title ?? active.label}>
          <header className="bt-panel-head">
            <h2>{active.title ?? active.label}</h2>
            <button
              type="button"
              className="bt-icon-btn"
              onClick={onClosePanel}
              title="Replier le panneau"
              aria-label="Replier le panneau"
            >
              <PanelLeftClose size={16} aria-hidden />
            </button>
          </header>
          <div className="bt-panel-body sidebar-tools-scope">
            <SidebarThemeProvider dark>{active.content}</SidebarThemeProvider>
          </div>
        </section>
      )}
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
        flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c2d12" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2v20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
      </svg>
    </span>
  );
}
