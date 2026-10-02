'use client';

import { useCallback, useEffect, useState } from 'react';

// Refonte UI — état purement UI de la coque (rail, panneaux latéraux).
// Séparé de useAppState (état tactique métier) pour ne pas polluer
// l'undo/redo ni l'export JSON avec des préférences d'affichage.

export type SidebarView =
  | 'court'
  | 'playbook'
  | 'library'
  | 'sessions'
  | 'settings'
  | 'scenariograph';

export type RightTab = 'steps' | 'settings';

const STORAGE_KEY = 'bt:sidebar:v1';

type Persisted = {
  /** Panneau contextuel de gauche replié (le rail d'icônes reste visible). */
  collapsed: boolean;
  activeView: SidebarView;
  /** Groupe d'outils affiché dans le panneau contextuel (id du ToolGroup). */
  activeTool: string;
  /** Colonne de droite repliée. */
  rightCollapsed: boolean;
  /** Onglet affiché dans la colonne de droite. */
  rightTab: RightTab;
};

const DEFAULTS: Persisted = {
  collapsed: false,
  activeView: 'court',
  activeTool: 'offense',
  rightCollapsed: false,
  rightTab: 'steps',
};

function load(): Persisted {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : DEFAULTS.collapsed,
      activeView: isView(parsed.activeView) ? parsed.activeView : DEFAULTS.activeView,
      activeTool: typeof parsed.activeTool === 'string' ? parsed.activeTool : DEFAULTS.activeTool,
      rightCollapsed: typeof parsed.rightCollapsed === 'boolean' ? parsed.rightCollapsed : DEFAULTS.rightCollapsed,
      rightTab: parsed.rightTab === 'settings' ? 'settings' : DEFAULTS.rightTab,
    };
  } catch {
    return DEFAULTS;
  }
}

function isView(v: unknown): v is SidebarView {
  return (
    v === 'court' ||
    v === 'playbook' ||
    v === 'library' ||
    v === 'sessions' ||
    v === 'settings' ||
    v === 'scenariograph'
  );
}

export function useSidebarState() {
  // SSR-safe : hydrater côté client uniquement.
  const [collapsed, setCollapsed] = useState<boolean>(DEFAULTS.collapsed);
  const [activeView, setActiveViewState] = useState<SidebarView>(DEFAULTS.activeView);
  const [activeTool, setActiveTool] = useState<string>(DEFAULTS.activeTool);
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(DEFAULTS.rightCollapsed);
  const [rightTab, setRightTab] = useState<RightTab>(DEFAULTS.rightTab);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = load();
    setCollapsed(persisted.collapsed);
    setActiveViewState(persisted.activeView);
    setActiveTool(persisted.activeTool);
    setRightCollapsed(persisted.rightCollapsed);
    setRightTab(persisted.rightTab);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ collapsed, activeView, activeTool, rightCollapsed, rightTab } satisfies Persisted)
      );
    } catch {
      // ignore (quota, navigation privée)
    }
  }, [collapsed, activeView, activeTool, rightCollapsed, rightTab, hydrated]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const setActiveView = useCallback((v: SidebarView) => {
    setActiveViewState(v);
  }, []);

  /** Ouvre un groupe d'outils dans le panneau (et déplie le panneau). */
  const openTool = useCallback((id: string) => {
    setActiveTool(id);
    setCollapsed(false);
  }, []);

  /** Affiche un onglet de la colonne de droite (et la déplie). */
  const openRight = useCallback((tab: RightTab) => {
    setRightTab(tab);
    setRightCollapsed(false);
  }, []);

  const toggleRight = useCallback(() => {
    setRightCollapsed((c) => !c);
  }, []);

  return { collapsed, activeView, activeTool, rightCollapsed, rightTab, toggleCollapse, setActiveView, openTool, openRight, toggleRight };
}
