'use client';

import { useState, useCallback, useEffect } from 'react';
import { useLocalSave } from './useLocalSave';
import type { AppState } from '@/lib/types';
import {
  loadLibrary,
  updateSavedSystem,
  saveLibrary,
  type UserLibrary,
  type SavedSystem,
  type UserDefensePreset,
  snapshotFromAppState,
  applySavedSystem,
  addSystemToFolder,
  deleteSystem as deleteSystemFn,
  renameSystem as renameSystemFn,
  moveSystem as moveSystemFn,
  setSystemTags as setSystemTagsFn,
  createFolder as createFolderFn,
  renameFolder as renameFolderFn,
  deleteFolder as deleteFolderFn,
  exportFolderJSON,
  importFolderJSON,
  snapshotDefensePreset,
  applyUserDefensePreset,
  addDefensePreset as addDefensePresetFn,
  deleteDefensePreset as deleteDefensePresetFn,
  renameDefensePreset as renameDefensePresetFn,
} from '@/lib/data/library';
import {
  makeSession,
  type PracticeSession,
  addSession as addSessionFn,
  updateSession as updateSessionFn,
  deleteSession as deleteSessionFn,
  renameSession as renameSessionFn,
  duplicateSession as duplicateSessionFn,
} from '@/lib/data/practiceSessions';

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

  const saveStatus = useLocalSave(library, hydrated, saveLibrary);
  const updateSystem = useCallback((id: string, state: AppState) => {
    setLibrary((lib) => updateSavedSystem(lib, id, state));
  }, []);

  const saveSystem = useCallback(
    (state: AppState, folderId: string, name: string, description?: string, tags?: string[]) => {
      const sys = snapshotFromAppState(state, name, description, tags);
      setLibrary((lib) => addSystemToFolder(lib, folderId, sys));
      return sys.id;
    },
    []
  );

  const setSystemTags = useCallback((systemId: string, tags: string[]) => {
    setLibrary((lib) => setSystemTagsFn(lib, systemId, tags));
  }, []);

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

  // ----- Defense presets utilisateur (équivalent défensif des templates) -----

  const saveDefensePreset = useCallback(
    (state: AppState, name: string, description?: string) => {
      const preset = snapshotDefensePreset(state, name, description);
      setLibrary((lib) => addDefensePresetFn(lib, preset));
      return preset.id;
    },
    []
  );

  const loadDefensePreset = useCallback(
    (state: AppState, preset: UserDefensePreset): AppState =>
      applyUserDefensePreset(state, preset),
    []
  );

  const deleteDefensePreset = useCallback((id: string) => {
    setLibrary((lib) => deleteDefensePresetFn(lib, id));
  }, []);

  const renameDefensePreset = useCallback((id: string, newName: string) => {
    setLibrary((lib) => renameDefensePresetFn(lib, id, newName));
  }, []);

  // ----- Séances d'entraînement (coaching #3) -----

  const createSession = useCallback((name: string): string => {
    const session = makeSession(name);
    setLibrary((lib) => addSessionFn(lib, session));
    return session.id;
  }, []);

  const updateSession = useCallback((session: PracticeSession) => {
    setLibrary((lib) => updateSessionFn(lib, session));
  }, []);

  const deleteSession = useCallback((id: string) => {
    setLibrary((lib) => deleteSessionFn(lib, id));
  }, []);

  const renameSession = useCallback((id: string, newName: string) => {
    setLibrary((lib) => renameSessionFn(lib, id, newName));
  }, []);

  const duplicateSession = useCallback((id: string) => {
    setLibrary((lib) => duplicateSessionFn(lib, id));
  }, []);

  return {
    library,
    hydrated,
    saveStatus,
    updateSystem,
    saveSystem,
    loadSystem,
    deleteSystem,
    renameSystem,
    moveSystem,
    setSystemTags,
    createFolder,
    renameFolder,
    deleteFolder,
    exportFolder,
    importFolder,
    saveDefensePreset,
    loadDefensePreset,
    deleteDefensePreset,
    renameDefensePreset,
    createSession,
    updateSession,
    deleteSession,
    renameSession,
    duplicateSession,
  };
}
