// Hook d'animation playback. Possède UNIQUEMENT la boucle de tick :
// timing, conversion elapsed → t fractionnaire, fin de lecture. Le calcul
// de la frame est externe (cf. `resolveFrameAt`) — ce hook s'en moque, il
// se contente de notifier `onTick(t)` à chaque tick.
//
// Approche en `setInterval` ~30 fps plutôt que `requestAnimationFrame` :
// déterministe et insensible aux re-renders qui réinitialisent le rAF.

import type { AppState } from '@/lib/types';
import { useEffect, useRef } from 'react';
import { playbackTickAtElapsed } from '@/lib/logic/playbackClock';

interface UsePlaybackAnimationParams {
  /** Activation de la boucle. Quand passe à true, démarre. À false, stop. */
  isPlaying: boolean;
  state?: AppState;
  /** Multiplicateur de vitesse (0.3× → 2×). 1 = vitesse nominale. */
  speed: number;
  /** Nombre total d'étapes - 1 (max valeur de `t`). Si <= 0, no-op. */
  totalSteps: number;
  /** Instant `t` initial au démarrage de la lecture. Permet de reprendre
   *  depuis un scrub au lieu de redémarrer du début. */
  startT: number;
  /** Notifié à chaque tick avec le `t` fractionnaire courant. */
  onTick: (t: number) => void;
  /** Notifié quand `t` atteint `totalSteps` (lecture terminée). */
  onEnd?: () => void;
  /** Mode vitesse réelle NBA */
  realSpeedMode?: boolean;
}

const TICK_INTERVAL_MS = 33; // ~30 fps

export function usePlaybackAnimation(params: UsePlaybackAnimationParams): void {
  const { isPlaying, speed } = params;
  const latest = useRef(params);
  latest.current = params;
  const speedRef = useRef(speed);
  const advanceRef = useRef<(() => void) | null>(null);

  // Termine le petit intervalle écoulé à l'ancienne vitesse avant d'en changer.
  useEffect(() => {
    advanceRef.current?.();
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let currentT = latest.current.startT;
    let ended = false;
    const tick = () => {
      if (ended) return;
      const now = performance.now();
      const current = latest.current;
      const result = playbackTickAtElapsed({
        startT: currentT, elapsedMs: now - lastTime, speed: speedRef.current,
        totalSteps: current.totalSteps, realSpeedMode: current.realSpeedMode, state: current.state,
      });
      lastTime = now;
      currentT = result.t;
      current.onTick(currentT);
      if (result.ended) {
        ended = true;
        window.clearInterval(intervalId);
        current.onEnd?.();
      }
    };
    const intervalId = window.setInterval(tick, TICK_INTERVAL_MS);
    advanceRef.current = tick;
    tick();
    return () => {
      advanceRef.current = null;
      window.clearInterval(intervalId);
    };
  }, [isPlaying]);
}
