// Hook combiné state React + pile undo/redo + drag coalescing.
// Extrait de useAppState (suite A5.2). Isole la mécanique d'historique
// (sans logique métier) pour la tester et garder useAppState lisible.
//
// API :
//  - `state` : valeur courante (comme useState)
//  - `stateRef` : référence stable lue dans les callbacks (évite la
//    re-création de useCallback quand `state` change)
//  - `setStateRaw` : setter direct, NE pousse PAS l'historique. Utilisé
//    pour l'hydration localStorage et les effets internes.
//  - `setStateWithHistory` : pousse l'état précédent dans `past`, vide
//    `future`. Utilisé par les actions utilisateur.
//  - `undo` / `redo` : naviguent dans la pile.
//  - `beginPlayerDrag` / `commitPlayerDrag` : coalesce les snapshots
//    pendant un drag pour ne créer qu'une seule entrée d'historique par
//    geste utilisateur (sinon le drag pollue le past avec 60 entrées).

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { AppState } from '@/lib/types';
import {
  commitCoalescedHistory,
  pushHistorySnapshot,
  redoFromHistory,
  undoFromHistory,
  type AppStateHistory,
} from '@/lib/logic/appStateHistory';

type Updater = AppState | ((prev: AppState) => AppState);

export interface HistorizedState {
  state: AppState;
  stateRef: MutableRefObject<AppState>;
  setStateRaw: (updater: Updater) => void;
  setStateWithHistory: (updater: Updater) => void;
  undo: () => void;
  redo: () => void;
  beginPlayerDrag: () => void;
  commitPlayerDrag: () => void;
}

export function useHistorizedState(initializer: () => AppState): HistorizedState {
  const [state, setState] = useState<AppState>(initializer);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pile undo/redo. Hors state principal pour ne pas re-rendre à chaque push.
  const historyRef = useRef<AppStateHistory>({ past: [], future: [] });
  // Anchor du drag : capture l'état AVANT le geste pour collapse en 1 entrée.
  const dragHistoryAnchorRef = useRef<AppState | null>(null);

  const setStateRaw = useCallback((updater: Updater) => {
    setState(updater);
  }, []);

  const setStateWithHistory = useCallback((updater: Updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      pushHistorySnapshot(historyRef.current, prev);
      return next;
    });
  }, []);

  const beginPlayerDrag = useCallback(() => {
    if (!dragHistoryAnchorRef.current) {
      dragHistoryAnchorRef.current = stateRef.current;
    }
  }, []);

  const commitPlayerDrag = useCallback(() => {
    const anchor = dragHistoryAnchorRef.current;
    dragHistoryAnchorRef.current = null;
    if (!anchor) return;
    setState((cur) => {
      commitCoalescedHistory(historyRef.current, anchor, cur);
      return cur;
    });
  }, []);

  const undo = useCallback(() => {
    setState((cur) => undoFromHistory(historyRef.current, cur));
  }, []);

  const redo = useCallback(() => {
    setState((cur) => redoFromHistory(historyRef.current, cur));
  }, []);

  return {
    state,
    stateRef,
    setStateRaw,
    setStateWithHistory,
    undo,
    redo,
    beginPlayerDrag,
    commitPlayerDrag,
  };
}
