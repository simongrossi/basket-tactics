// Navigation par « vraie étape » (real step) — coaching / présentation.
//
// Les `steps` contiennent des étapes RÉELLES (éditées) et des étapes
// INTERPOLÉES (`isInterpolated`) insérées pour lisser l'animation. Pour
// présenter un système à des joueurs phase par phase, on ne navigue que sur
// les étapes réelles. Ce module centralise ce calcul, jusqu'ici dupliqué
// (timecode.ts, page.tsx, MultiTrackTimeline…).

import type { Step } from '../../types';

/** Indices (dans `steps`) des étapes réelles (non interpolées), dans l'ordre. */
export function realStepIndices(steps: Step[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].isInterpolated) out.push(i);
  }
  return out;
}

/** Index de l'étape réelle SUIVANTE strictement après `activeStep`.
 *  Si déjà sur/après la dernière réelle → retourne la dernière réelle
 *  (clamp, pas de wrap). Retourne `activeStep` si aucune réelle. */
export function nextRealStepIndex(steps: Step[], activeStep: number): number {
  const reals = realStepIndices(steps);
  if (reals.length === 0) return activeStep;
  for (const idx of reals) {
    if (idx > activeStep) return idx;
  }
  return reals[reals.length - 1];
}

/** Index de l'étape réelle PRÉCÉDENTE strictement avant `activeStep`.
 *  Si déjà sur/avant la première réelle → retourne la première réelle
 *  (clamp, pas de wrap). Retourne `activeStep` si aucune réelle. */
export function prevRealStepIndex(steps: Step[], activeStep: number): number {
  const reals = realStepIndices(steps);
  if (reals.length === 0) return activeStep;
  for (let k = reals.length - 1; k >= 0; k--) {
    if (reals[k] < activeStep) return reals[k];
  }
  return reals[0];
}

/** Vrai si `activeStep` est sur (ou après) la dernière étape réelle. */
export function isOnLastRealStep(steps: Step[], activeStep: number): boolean {
  const reals = realStepIndices(steps);
  if (reals.length === 0) return true;
  return activeStep >= reals[reals.length - 1];
}

/** Vrai si `activeStep` est sur (ou avant) la première étape réelle. */
export function isOnFirstRealStep(steps: Step[], activeStep: number): boolean {
  const reals = realStepIndices(steps);
  if (reals.length === 0) return true;
  return activeStep <= reals[0];
}
