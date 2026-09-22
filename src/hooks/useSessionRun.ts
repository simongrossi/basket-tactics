'use client';

// U05 — état du déroulé de séance (bloc en cours + minuteur), persisté pour
// survivre à un rechargement. Horloge rafraîchie chaque seconde uniquement
// quand le minuteur tourne.

import { useCallback, useEffect, useState } from 'react';
import {
  SESSION_RUN_STORAGE_KEY,
  parseSessionRun,
  type SessionRun,
} from '@/lib/data/sessionRun';

function load(): SessionRun | null {
  try {
    return parseSessionRun(window.localStorage.getItem(SESSION_RUN_STORAGE_KEY));
  } catch {
    return null;
  }
}

function persist(run: SessionRun | null) {
  try {
    if (run) window.localStorage.setItem(SESSION_RUN_STORAGE_KEY, JSON.stringify(run));
    else window.localStorage.removeItem(SESSION_RUN_STORAGE_KEY);
  } catch {
    // Stockage indisponible : le déroulé reste valable pour cet onglet.
  }
}

export function useSessionRun() {
  const [run, setRunState] = useState<SessionRun | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Lecture post-montage (sinon mismatch d'hydratation SSR).
  useEffect(() => {
    setRunState(load());
    setHydrated(true);
  }, []);

  const setRun = useCallback((next: SessionRun | null | ((prev: SessionRun | null) => SessionRun | null)) => {
    setRunState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      persist(value);
      return value;
    });
    setNow(Date.now());
  }, []);

  const running = run?.timer.runningSince != null;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  return { run, setRun, now, hydrated };
}
