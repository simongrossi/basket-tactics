// C.2 — Help-and-recover timing : compteur de steps consécutifs où un
// défenseur était plausiblement en aide active.
//
// Aujourd'hui un défenseur en `helpTriggered === true` au step N redevient
// instantanément homme-à-homme au step N+1 si le trigger (drive/post/paint)
// a disparu. Visuellement → "clignotement" de l'aide.
//
// V1 sans dépendance B.1 : on compte les steps consécutifs où la défense
// aurait DÉCLENCHÉ l'aide pour ce défenseur, basé sur 3 conditions cumulées :
//   1. Un trigger d'aide est actif (drive/post/paint) au step considéré.
//   2. Le défenseur a `helpPct > 0` (config règle).
//   3. Sa stance est 'sag' (les stances dirigées ne déclenchent pas d'aide).
//
// ⚠ Approximation volontaire : on NE recalcule PAS `computeHelpTarget` ni
// `computeDefenseTargets` pour les steps précédents. Sinon récursion infinie
// quand `applyHelpStickyLayer` (couche 1.6) appelle ce compteur depuis
// `computeDefenseTargets` du step courant.
//
// L'approximation suffit pour C.2 : on veut juste détecter "ce défenseur a
// été en aide récemment" comme heuristique pour bloquer le recover instantané.
// La cible d'aide EXACTE est récupérée via `prevHelpAim` dans la couche
// d'intégration, pas ici.

import type {
  AppState,
  AttackerPositions,
  DefenderId,
  Point,
  Step,
} from '../../types';
import { detectTriggers } from '../triggers';
import { getDefenseHoop } from '../engine';
import { activeBallCarrier, activeOffense } from '../players';
import { getStepDurationSeconds } from '../timecode';

/**
 * Compte combien de steps consécutifs (REMONTANT depuis `stepIdx - 1`) ont
 * eu un déclenchement d'aide plausible pour ce défenseur.
 *
 *   - Retourne 0 si le step précédent n'a pas de trigger d'aide pour ce
 *     défenseur, ou si stepIdx === 0.
 *   - Retourne 1 si seulement le step N-1 a eu de l'aide.
 *   - Retourne 2 si N-1 ET N-2, etc.
 *
 * Lookback limité à `maxLookback` (default 5) pour bornage du coût.
 */
export function consecutiveHelpSteps(
  state: AppState,
  stepIdx: number,
  defenderId: DefenderId,
  maxLookback: number = 5
): number {
  if (stepIdx <= 0) return 0;
  const rule = state.rules[defenderId];
  if (!rule) return 0;
  if ((rule.helpPct ?? 0) === 0) return 0;
  const stance = rule.offBallStance ?? 'sag';
  if (stance !== 'sag') return 0;

  const hoop = getDefenseHoop(state);
  let count = 0;
  const start = Math.max(0, stepIdx - 1 - maxLookback + 1);

  for (let i = stepIdx - 1; i >= start; i--) {
    if (!plausibleHelpTrigger(state, i, hoop)) break;
    count++;
  }
  return count;
}

/**
 * C.2 V2 — Temps cumulé (en ms) d'aide consécutive aux steps précédents.
 *
 * Combine `consecutiveHelpSteps` (compte) et `getStepDurationSeconds`
 * (durée individuelle de chaque step, B.1) pour exprimer le seuil de
 * "sticky help" en millisecondes plutôt qu'en steps. Plus fidèle basket
 * (1.2s d'aide ≈ standard NBA) car indépendant du découpage en steps.
 *
 * Sémantique : si steps [stepIdx-consec .. stepIdx-1] étaient en aide,
 * la durée cumulée est Σ step[stepIdx-k].duration pour k=1..consec.
 * Chaque `step[k].duration` représente la transition step[k] → step[k+1],
 * donc le temps passé "dans la stance d'aide" pendant ce step.
 */
export function cumulatedHelpMs(
  state: AppState,
  stepIdx: number,
  defenderId: DefenderId,
  maxLookback: number = 5
): number {
  const consec = consecutiveHelpSteps(state, stepIdx, defenderId, maxLookback);
  if (consec === 0) return 0;
  let totalMs = 0;
  for (let k = 1; k <= consec; k++) {
    const idx = stepIdx - k;
    if (idx < 0) break;
    totalMs += getStepDurationSeconds(state, idx) * 1000;
  }
  return totalMs;
}

/** Vérifie qu'un trigger d'aide est actif au step `i` (drive/post/paint).
 *  Pur, pas de récursion. */
function plausibleHelpTrigger(state: AppState, i: number, hoop: Point): boolean {
  const step: Step | undefined = state.steps[i];
  if (!step) return false;
  const off = activeOffense(step.off, state.playerCount);
  const carrier = activeBallCarrier(step, state.playerCount);
  const prevOff: AttackerPositions | null =
    i > 0 ? activeOffense(state.steps[i - 1].off, state.playerCount) : null;
  const triggers = detectTriggers(off, prevOff, carrier, state.triggers, hoop);
  return triggers.any;
}
