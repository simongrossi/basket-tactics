'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppState } from '@/lib/types';
import {
  loadLibrary,
  saveLibrary,
  type UserLibrary,
  type SavedSystem,
  snapshotFromAppState,
  applySavedSystem,
  addSystemToFolder,
  deleteSystem as deleteSystemFn,
  renameSystem as renameSystemFn,
  moveSystem as moveSystemFn,
  createFolder as createFolderFn,
  renameFolder as renameFolderFn,
  deleteFolder as deleteFolderFn,
  exportFolderJSON,
  importFolderJSON,
} from '@/lib/data/library';

/**
 * Hook bibliothèque utilisateur. Gère l'état persisté en localStorage
 * (dossiers + systèmes sauvegardés) et expose des actions pures.
 *
 * Indépendant du AppState courant : pour charger un système, le composant
 * appelle libraryActions.loadSystem(sys) qui retourne le nouvel AppState
 * que le composant applique via app.importState(...).
 */
export function useLibrary() {
  // SSR-safe : on initialise vide et on hydrate après mount.
  const [library, setLibrary] = useState<UserLibrary>(() => ({
    version: 1,
    folders: [],
  }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLibrary(loadLibrary());
    setHydrated(true);
  }, []);

  // Persist debounced à chaque modification post-hydration.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveLibrary(library), 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [library, hydrated]);

  const saveSystem = useCallback(
    (state: AppState, folderId: string, name: string, description?: string) => {
      const sys = snapshotFromAppState(state, name, description);
      setLibrary((lib) => addSystemToFolder(lib, folderId, sys));
      return sys.id;
    },
    []
  );

  const loadSystem = useCallback(
    (state: AppState, sys: SavedSystem): AppState => applySavedSystem(state, sys),
    []
  );

  const deleteSystem = useCallback((systemId: string) => {
    setLibrary((lib) => deleteSystemFn(lib, systemId));
  }, []);

  const renameSystem = useCallback((systemId: string, newName: string) => {
    setLibrary((lib) => renameSystemFn(lib, systemId, newName));
  }, []);

  const moveSystem = useCallback((systemId: string, targetFolderId: string) => {
    setLibrary((lib) => moveSystemFn(lib, systemId, targetFolderId));
  }, []);

  const createFolder = useCallback((name: string) => {
    setLibrary((lib) => createFolderFn(lib, name));
  }, []);

  const renameFolder = useCallback((folderId: string, newName: string) => {
    setLibrary((lib) => renameFolderFn(lib, folderId, newName));
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    setLibrary((lib) => deleteFolderFn(lib, folderId));
  }, []);

  const exportFolder = useCallback(
    (folderId: string): string | null => {
      const folder = library.folders.find((f) => f.id === folderId);
      return folder ? exportFolderJSON(folder) : null;
    },
    [library]
  );

  const importFolder = useCallback((json: string) => {
    setLibrary((lib) => importFolderJSON(lib, json));
  }, []);

  return {
    library,
    hydrated,
    saveSystem,
    loadSystem,
    deleteSystem,
    renameSystem,
    moveSystem,
    createFolder,
    renameFolder,
    deleteFolder,
    exportFolder,
    importFolder,
  };
}
