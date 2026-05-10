// Timecode — Étape 13. Convertit un index d'étape (full ou real) en secondes
// puis formate en horloge MM:SS ou en shot clock (secondes restantes sur 24).
//
// Le moteur reste step-based : ces utilitaires sont uniquement pour l'AFFICHAGE.
// Pendant la lecture, on multiplie l'index courant par `secondsPerStep` pour
// obtenir l'horloge "in-universe", indépendamment de la vitesse de lecture.

import type { AppState } from '../types';
import { countRealSteps } from './playerTracks';

export const DEFAULT_SECONDS_PER_STEP = 4;
export const DEFAULT_POSSESSION_SECONDS = 24;

/** Renvoie la durée d'une étape (en s), avec fallback sur le défaut. */
export function getSecondsPerStep(state: AppState): number {
  const v = state.secondsPerStep;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return DEFAULT_SECONDS_PER_STEP;
  return v;
}

/** Renvoie la durée totale de possession (en s), avec fallback. */
export function getPossessionSeconds(state: AppState): number {
  const v = state.possessionSeconds;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return DEFAULT_POSSESSION_SECONDS;
  return v;
}

/**
 * Convertit un index d'étape (peut être fractionnaire pendant la lecture,
 * exprimé en espace "real steps" non-interpolés) en secondes depuis le début
 * de la possession.
 *
 * realStepIdx=0 → 0s
 * realStepIdx=1 → secondsPerStep
 * realStepIdx=N (dernière étape) → N × secondsPerStep
 */
export function realStepToSeconds(state: AppState, realStepIdx: number): number {
  return Math.max(0, realStepIdx) * getSecondsPerStep(state);
}

/**
 * Formate des secondes en `MM:SS` (ou `M:SS` si <10min). Toujours arrondi
 * au dixième en interne, mais affiché à la seconde près pour rester lisible.
 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Formate des secondes en shot clock `:SS.D` (dixièmes sous 5s, sinon arrondi
 * à la seconde). Renvoie 0 quand le temps est écoulé.
 */
export function formatShotClock(secondsLeft: number): string {
  const s = Math.max(0, secondsLeft);
  if (s < 5) return s.toFixed(1);
  return Math.ceil(s).toString();
}

/**
 * Renvoie le shot clock restant à un index d'étape réel donné.
 * Si la possession est plus courte que le total d'étapes réelles,
 * peut renvoyer 0 (violation des 24s).
 */
export function shotClockAt(state: AppState, realStepIdx: number): number {
  const elapsed = realStepToSeconds(state, realStepIdx);
  return Math.max(0, getPossessionSeconds(state) - elapsed);
}

/**
 * Durée totale du scénario en secondes (basée sur le nombre d'étapes réelles).
 * Une possession a (N-1) transitions × secondsPerStep, où N = realStepsCount.
 */
export function totalDurationSeconds(state: AppState): number {
  const real = countRealSteps(state);
  if (real <= 1) return 0;
  return (real - 1) * getSecondsPerStep(state);
}
