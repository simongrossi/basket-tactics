// Hook d'animation playback. Possède UNIQUEMENT la boucle de tick :
// timing, conversion elapsed → t fractionnaire, fin de lecture. Le calcul
// de la frame est externe (cf. `resolveFrameAt`) — ce hook s'en moque, il
// se contente de notifier `onTick(t)` à chaque tick.
//
// Approche en `setInterval` ~30 fps plutôt que `requestAnimationFrame` :
// déterministe et insensible aux re-renders qui réinitialisent le rAF.

import { useEffect, useRef } from 'react';
import { playbackTickAtElapsed } from '@/lib/logic/playbackClock';

interface UsePlaybackAnimationParams {
  /** Activation de la boucle. Quand passe à true, démarre. À false, stop. */
  isPlaying: boolean;
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
  const { isPlaying, speed, realSpeedMode } = params;

  // Refs pour découpler la boucle des changements de props (sinon chaque
  // changement de speed/state restart la boucle et la lecture stutter).
  const totalStepsRef = useRef(params.totalSteps);
  totalStepsRef.current = params.totalSteps;
  const startTRef = useRef(params.startT);
  startTRef.current = params.startT;
  const onTickRef = useRef(params.onTick);
  onTickRef.current = params.onTick;
  const onEndRef = useRef(params.onEnd);
  onEndRef.current = params.onEnd;

  useEffect(() => {
    if (!isPlaying) return;
    const playStart = performance.now();
    const startT = startTRef.current;

    const tick = () => {
      const totalSteps = totalStepsRef.current;
      if (totalSteps <= 0) {
        window.clearInterval(intervalId);
        return;
      }
      const elapsed = performance.now() - playStart;
      const tickInfo = playbackTickAtElapsed({ startT, elapsedMs: elapsed, speed, totalSteps, realSpeedMode });
      if (tickInfo.ended) {
        window.clearInterval(intervalId);
        onTickRef.current(tickInfo.t);
        onEndRef.current?.();
        return;
      }
      onTickRef.current(tickInfo.t);
    };

    const intervalId = window.setInterval(tick, TICK_INTERVAL_MS);
    tick(); // premier frame immédiat
    return () => window.clearInterval(intervalId);
  }, [isPlaying, speed, realSpeedMode]);
}
