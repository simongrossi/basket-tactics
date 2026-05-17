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

/** Renvoie la durée d'une étape (en s), avec fallback sur le défaut.
 *  C'est la valeur GLOBALE par défaut, utilisée si `step.duration` n'est
 *  pas défini (cf. `getStepDurationSeconds`). */
export function getSecondsPerStep(state: AppState): number {
  const v = state.secondsPerStep;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return DEFAULT_SECONDS_PER_STEP;
  return v;
}

/** B.1 — Durée d'un step donné (transition step → step+1) en secondes.
 *  Lit `step.duration` si défini et valide, sinon retombe sur la valeur
 *  globale `state.secondsPerStep`. Sécurise contre les index hors-bornes. */
export function getStepDurationSeconds(state: AppState, stepIdx: number): number {
  const step = state.steps[stepIdx];
  const d = step?.duration;
  if (typeof d === 'number' && isFinite(d) && d > 0) return d;
  return getSecondsPerStep(state);
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
 * de la possession. B.1 — accumule `step.duration` par step au lieu d'un
 * multiplicateur global, pour respecter les durées individuelles.
 *
 * realStepIdx=0 → 0s
 * realStepIdx=1 → duration(realSteps[0])
 * realStepIdx=k.frac → Σ duration(realSteps[0..k-1]) + frac · duration(realSteps[k])
 */
export function realStepToSeconds(state: AppState, realStepIdx: number): number {
  const i = Math.max(0, realStepIdx);
  const whole = Math.floor(i);
  const frac = i - whole;

  const realIndices: number[] = [];
  for (let idx = 0; idx < state.steps.length; idx++) {
    if (!state.steps[idx].isInterpolated) realIndices.push(idx);
  }
  if (realIndices.length === 0) return 0;

  const sps = getSecondsPerStep(state);
  let acc = 0;
  for (let k = 0; k < whole; k++) {
    // Transitions internes : utilisent la duration du step k ; au-delà du
    // dernier real step (shotClockAt extrapole parfois), on retombe sur
    // la valeur globale (pas de duration disponible).
    if (k < realIndices.length - 1) {
      acc += getStepDurationSeconds(state, realIndices[k]);
    } else {
      acc += sps;
    }
  }
  if (frac > 0) {
    if (whole < realIndices.length - 1) {
      acc += frac * getStepDurationSeconds(state, realIndices[whole]);
    } else {
      acc += frac * sps;
    }
  }
  return acc;
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
 * B.2 — Catégorise un shot clock restant en 3 paliers visuels :
 *   - 'safe'    > 8 s : zone verte, la défense a le temps
 *   - 'warning' 5-8 s : zone jaune, fin de possession imminente
 *   - 'danger'  ≤ 4 s : zone rouge, l'attaque DOIT shooter (cf. F.5)
 *
 * Utilisé par Timeline, SimulationSection et LiveMatchOverlay pour
 * unifier les seuils (auparavant dupliqués).
 */
export type ShotClockBand = 'safe' | 'warning' | 'danger';

export function shotClockBand(secondsLeft: number): ShotClockBand {
  if (secondsLeft <= 4) return 'danger';
  if (secondsLeft <= 8) return 'warning';
  return 'safe';
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
 * Durée totale du scénario en secondes. B.1 — somme les durées individuelles
 * de chaque step réel (transition step→step+1). Sans `step.duration` défini,
 * tous les steps utilisent `getSecondsPerStep(state)` (rétrocompat).
 */
export function totalDurationSeconds(state: AppState): number {
  const realIndices: number[] = [];
  for (let idx = 0; idx < state.steps.length; idx++) {
    if (!state.steps[idx].isInterpolated) realIndices.push(idx);
  }
  if (realIndices.length <= 1) return 0;
  let total = 0;
  for (let k = 0; k < realIndices.length - 1; k++) {
    total += getStepDurationSeconds(state, realIndices[k]);
  }
  return total;
}
