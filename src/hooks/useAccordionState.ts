'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Livraison 2 — état déplié/replié d'une section accordion, persisté
 * en localStorage par utilisateur.
 *
 * Stockage : clé unique partagée pour TOUT le panneau Défense (et autres
 * panneaux si on étend plus tard). Format JSON :
 *   { "system": true, "globalSettings": false, "individualRules": false }
 *
 * Robustesse :
 *  - SSR : `typeof window === 'undefined'` retourne `defaultOpen` au premier
 *    render (HTML serveur). La valeur localStorage est lue UNIQUEMENT après
 *    montage côté client (useEffect) pour éviter les erreurs d'hydration
 *    Next.js (HTML serveur ≠ HTML client → mismatch).
 *  - JSON corrompu : try/catch silencieux + fallback default
 *  - localStorage indisponible (Safari private mode) : log silencieux
 *
 * Conséquence : flicker possible de ~1 frame si la valeur stockée diffère
 * du `defaultOpen` (la section ouvre/ferme après le premier paint). C'est
 * imperceptible visuellement et c'est le prix à payer pour la SSR.
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
 * @param defaultOpen Valeur à utiliser au premier render (SSR + avant mount).
 */
export function useAccordionState(
  id: string,
  defaultOpen: boolean
): [boolean, (next: boolean) => void] {
  // Au premier render (SSR + hydration client) : on retourne TOUJOURS
  // `defaultOpen` pour garantir que le HTML serveur == HTML client.
  const [open, setOpen] = useState<boolean>(defaultOpen);

  // Après montage côté client uniquement : on lit localStorage et on met
  // à jour si différent. Si erreur d'hydration sinon (cf. Next.js docs).
  useEffect(() => {
    const stored = readState();
    if (id in stored && stored[id] !== open) {
      setOpen(stored[id]);
    }
    // Volontaire : on lit localStorage UNE fois au mount, pas à chaque
    // changement de `open` (sinon boucle infinie avec la condition stored[id] !== open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
