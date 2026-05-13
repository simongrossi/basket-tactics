'use client';

import { useCallback, useState } from 'react';

/**
 * Livraison 2 — état déplié/replié d'une section accordion, persisté
 * en localStorage par utilisateur.
 *
 * Stockage : clé unique partagée pour TOUT le panneau Défense (et autres
 * panneaux si on étend plus tard). Format JSON :
 *   { "system": true, "globalSettings": false, "individualRules": false, "version": 1 }
 *
 * Robustesse :
 *  - SSR : `typeof window === 'undefined'` retourne `defaultOpen`
 *  - JSON corrompu : try/catch silencieux + fallback default
 *  - localStorage indisponible (Safari private mode) : log silencieux
 */

const STORAGE_KEY = 'basket-tactics:accordion-state-v1';

interface StoredState {
  [sectionId: string]: boolean;
}

function readState(): StoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state: StoredState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage indisponible — ignoré silencieusement */
  }
}

/**
 * Hook pour gérer l'état déplié/replié d'une section avec persistence
 * locale.
 *
 * @param id Identifiant stable de la section (clé localStorage).
 * @param defaultOpen Valeur à utiliser si rien n'est stocké pour cet id.
 */
export function useAccordionState(
  id: string,
  defaultOpen: boolean
): [boolean, (next: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = readState();
    return id in stored ? stored[id] : defaultOpen;
  });

  const setOpenAndPersist = useCallback(
    (next: boolean) => {
      setOpen(next);
      const stored = readState();
      stored[id] = next;
      writeState(stored);
    },
    [id]
  );

  return [open, setOpenAndPersist];
}
