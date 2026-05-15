// Phase I — B1 : hook React qui pilote `gameLoop.tickMatch` via setInterval.
//
// Responsabilités UNIQUEMENT :
//  - Démarrer/arrêter le timer de tick
//  - Maintenir l'état courant `MatchState` dans un useState pour re-render
//  - Exposer les actions `start`/`pause`/`resume`/`stop`
//
// La logique de simulation vit dans `gameLoop.ts` (pur, testable). Ce
// hook ne fait que le câblage React.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
  type MatchState,
  type CreateMatchStateOptions,
  type TickMatchOptions,
} from '@/lib/logic/match/gameLoop';

interface UseMatchLoopOptions {
  /** État de base utilisé pour seed la possession et recompute la défense
   *  à chaque tick. NE PAS confondre avec `matchState` qui est l'état
   *  live mutable. */
  baseState: AppState;
  /** Vitesse de lecture : 1 = temps réel (200 ms / tick), 2 = 2× plus
   *  rapide, etc. Default : 1. */
  speed?: number;
  /** Options de tick (créativité, etc.). */
  tickOptions?: TickMatchOptions;
}

export interface UseMatchLoopResult {
  /** État live courant. `null` quand pas démarré. */
  matchState: MatchState | null;
  /** Boolean dérivé : la loop tourne actuellement. */
  isRunning: boolean;
  /** Démarre une nouvelle possession depuis baseState. Si déjà en cours,
   *  reset et redémarre. */
  start: (options?: CreateMatchStateOptions) => void;
  /** Met en pause (stoppe le timer, garde l'état courant). */
  pause: () => void;
  /** Reprend depuis l'état courant. No-op si déjà en cours ou si pas démarré. */
  resume: () => void;
  /** Stoppe complètement : libère le state, repasse à `null`. */
  stop: () => void;
}

export function useMatchLoop(opts: UseMatchLoopOptions): UseMatchLoopResult {
  const { baseState, speed = 1, tickOptions } = opts;
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Refs pour ne pas re-créer le timer à chaque re-render.
  const baseStateRef = useRef(baseState);
  baseStateRef.current = baseState;
  const tickOptionsRef = useRef(tickOptions);
  tickOptionsRef.current = tickOptions;
  const matchStateRef = useRef<MatchState | null>(matchState);
  matchStateRef.current = matchState;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const cur = matchStateRef.current;
    if (!cur) return;
    if (cur.outcome !== null) {
      // Possession terminée : on stoppe le timer mais on garde l'état
      // affiché pour que l'UI montre l'outcome final.
      clearTimer();
      setIsRunning(false);
      return;
    }
    const next = tickMatch(cur, MATCH_TICK_MS, baseStateRef.current, tickOptionsRef.current);
    matchStateRef.current = next;
    setMatchState(next);
  }, [clearTimer]);

  const startTimer = useCallback(() => {
    clearTimer();
    const intervalMs = Math.max(16, MATCH_TICK_MS / Math.max(0.1, speed));
    intervalRef.current = setInterval(tick, intervalMs);
    setIsRunning(true);
  }, [clearTimer, speed, tick]);

  const start = useCallback((options: CreateMatchStateOptions = {}) => {
    const fresh = createInitialMatchState(baseStateRef.current, options);
    matchStateRef.current = fresh;
    setMatchState(fresh);
    startTimer();
  }, [startTimer]);

  const pause = useCallback(() => {
    clearTimer();
    setIsRunning(false);
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (!matchStateRef.current || matchStateRef.current.outcome !== null) return;
    if (isRunning) return;
    startTimer();
  }, [isRunning, startTimer]);

  const stop = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    matchStateRef.current = null;
    setMatchState(null);
  }, [clearTimer]);

  // Cleanup à l'unmount : essentiel pour ne pas leak un setInterval.
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Si la vitesse change pendant la lecture, on relance le timer avec
  // le nouvel intervalle.
  useEffect(() => {
    if (isRunning) startTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  return { matchState, isRunning, start, pause, resume, stop };
}
