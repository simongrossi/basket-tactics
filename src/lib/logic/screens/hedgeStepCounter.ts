// C.3 — Hedge length : compteur de steps consécutifs en hedge sur un poseur.
//
// Aujourd'hui, si la rule globale est 'hedge' et qu'un écran est détecté
// au step N, D5 sort en hedge. Si l'écran est encore détecté à N+1, D5
// reste sorti. Le coach n'a aucun contrôle sur la DURÉE du hedge — soit
// l'écran disparaît (D5 recover), soit il reste (D5 reste sorti).
//
// V1 : helper qui compte combien de steps CONSÉCUTIFS (en remontant
// depuis stepIdx) ont eu un écran détecté avec LE MÊME poseur. Le caller
// (defense/context.ts) utilise ce compteur pour FORCER recovery quand
// `state.hedgeRecoveryDelay` est défini et dépassé.
//
// ⚠ Cette fonction est appelée DEPUIS `buildDefenseFrameContext`. On ne
// peut donc PAS utiliser `computeDefenseTargets` pour les step précédents
// (ça déclencherait une récursion infinie : chaque step prev appellerait
// à nouveau le même check hedge). On utilise une APPROXIMATION : les
// positions défensives `defenseOverrides` du step si présentes, sinon
// `state.defenseInitial` (homepos). Suffisant pour détecter "même poseur
// sur même carrier" — la géométrie du poseur est stable d'un step à l'autre.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderPositions,
  Matchups,
  Point,
} from '../../types';
import { getMatchupsAt } from '../engine';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { initialDef } from '../../data/initial';
import { detectScreen } from './detectCarrierScreen';

/**
 * Compte combien de steps consécutifs (incluant `stepIdx` lui-même) ont eu
 * un écran porteur détecté avec le MÊME poseur `screener`.
 *
 *  - Retourne `0` si le step courant n'a pas d'écran ou poseur différent.
 *  - Retourne `1` si seul le step courant a l'écran avec ce poseur.
 *  - Retourne `2` si N et N-1.
 *  - etc.
 *
 * Le scan remonte jusqu'à `maxLookback` (default 5) pour éviter les coûts
 * sur de longs scénarios. Au-delà, on suppose que l'écran s'est déjà
 * relâché et recover s'est produit.
 *
 * Utilise `approxDefenderPositions` (positions homepos) pour éviter la
 * récursion via `computeDefenseTargets`.
 */
export function consecutiveHedgeSteps(
  state: AppState,
  stepIdx: number,
  screener: AttackerId,
  maxLookback: number = 5
): number {
  let count = 0;
  const start = Math.max(0, stepIdx - maxLookback + 1);
  for (let i = stepIdx; i >= start; i--) {
    const step = state.steps[i];
    if (!step) break;
    const off = activeOffense(step.off, state.playerCount);
    const ballCarrier = activeBallCarrier(step, state.playerCount);
    const matchups: Matchups = getMatchupsAt(state.steps, i - 1, state.playerCount);
    const prevOff: AttackerPositions | undefined =
      i > 0 ? activeOffense(state.steps[i - 1].off, state.playerCount) : undefined;
    const defPos = approxDefenderPositions(state, step);
    const screen = detectScreen(
      off,
      ballCarrier,
      matchups,
      defPos,
      state.screenRadius,
      step.forcedScreener,
      prevOff
    );
    if (!screen || screen.screener !== screener) {
      // Coupure de continuité — on s'arrête.
      break;
    }
    count++;
  }
  return count;
}

/** Positions défensives approximées : override manuel du step si présent,
 *  sinon `state.defenseInitial` (homepos). Évite la récursion via
 *  `computeDefenseTargets`. */
function approxDefenderPositions(
  state: AppState,
  step: { defenseOverrides?: Record<string, Point> }
): DefenderPositions {
  const active = new Set<string>(getActiveDefenderIds(state.playerCount));
  const out: Record<string, Point> = {};
  active.forEach((dId) => {
    const override = step.defenseOverrides?.[dId];
    if (override) {
      out[dId] = override;
    } else {
      const init = (state.defenseInitial as Record<string, Point>)[dId];
      out[dId] = init ?? (initialDef as Record<string, Point>)[dId];
    }
  });
  return out as DefenderPositions;
}
