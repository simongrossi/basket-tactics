'use client';

import { useCallback, useEffect, useState } from 'react';

// Thème de l'interface : clair par défaut, sombre quand le système le demande
// (mode automatique) ou quand l'utilisateur le force. Préférence d'affichage
// pure : hors useAppState, donc hors undo/redo et hors export.

export type ThemeMode = 'auto' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'bt:theme';

export function resolveTheme(mode: ThemeMode, systemDark: boolean): 'light' | 'dark' {
  return mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') setModeState(saved);
    } catch { /* stockage indisponible : on reste en automatique */ }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = resolveTheme(mode, mq.matches); };
    apply();
    if (mode !== 'auto') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      if (next === 'auto') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* la session reste utilisable */ }
  }, []);

  return { mode, setMode };
}
