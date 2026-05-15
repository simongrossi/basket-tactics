'use client';

import { useCallback, useEffect, useState } from 'react';

// Refonte UI — état purement UI de la sidebar gauche.
// Séparé de useAppState (état tactique métier) pour ne pas polluer
// l'undo/redo ni l'export JSON avec des préférences d'affichage.

export type SidebarView =
  | 'court'
  | 'playbook'
  | 'library'
  | 'screenLab'
  | 'settings';

const STORAGE_KEY = 'bt:sidebar:v1';

type Persisted = {
  collapsed: boolean;
  activeView: SidebarView;
};

const DEFAULTS: Persisted = {
  collapsed: false,
  activeView: 'court',
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
    };
  } catch {
    return DEFAULTS;
  }
}

function isView(v: unknown): v is SidebarView {
  return v === 'court' || v === 'playbook' || v === 'library' || v === 'screenLab' || v === 'settings';
}

export function useSidebarState() {
  // SSR-safe : hydrater côté client uniquement.
  const [collapsed, setCollapsed] = useState<boolean>(DEFAULTS.collapsed);
  const [activeView, setActiveViewState] = useState<SidebarView>(DEFAULTS.activeView);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = load();
    setCollapsed(persisted.collapsed);
    setActiveViewState(persisted.activeView);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ collapsed, activeView } satisfies Persisted)
      );
    } catch {
      // ignore (quota, navigation privée)
    }
  }, [collapsed, activeView, hydrated]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const setActiveView = useCallback((v: SidebarView) => {
    setActiveViewState(v);
  }, []);

  return { collapsed, activeView, toggleCollapse, setActiveView };
}
