// Phase 1.2 — Montée de balle (advance the ball)
//
// Module pur qui gère la phase "porteur en backcourt monte la balle vers
// la frontcourt". Réutilisé par gameLoop.ts dans le tick.
//
// Règles FIBA modélisées :
// - 8 secondes pour franchir la ligne médiane (sinon violation = turnover).
// - Vitesse réduite par rapport à un drive classique (~70% du max).
//
// Pas de mutation directe : prend un MatchState, retourne un nouveau.

import type { AppState, Point } from '@/lib/types';
import type { MatchState } from './gameLoop';

/** Vitesse en px/tick pendant la montée de balle. Plus lent qu'un drive
 *  classique (8 px/tick) car le porteur n'est pas encore en attaque. */
const ADVANCE_STEP_PX = 5.6; // ≈ 70% de MAX_CARRIER_STEP_PX

/**
 * Fait avancer le porteur d'un tick pendant la phase advance.
 * Décrémente advanceTimerMs. Si la médiane est franchie, retourne intent
 * idle. Si le timer expire avant, retourne un outcome turnover.
 */
export function advanceBallAdvance(
  state: MatchState,
  dtMs: number,
  _baseAppState: AppState
): MatchState {
  if (state.intent.kind !== 'advance') return state;

  const remaining = state.intent.advanceTimerMs - dtMs;
  const carrierPos = state.off[state.carrier];
  if (!carrierPos) return state;

  // Violation 8s — turnover si pas franchi
  if (remaining <= 0 && carrierPos.y > state.intent.targetY) {
    return {
      ...state,
      intent: { kind: 'idle' },
      outcome: 'turnover-pass',
      eventLog: [
        ...state.eventLog,
        {
          possession: state.possession,
          clock: state.shotClockMs / 1000,
          actor: state.carrier,
          type: 'turnover',
          label: `⚠ Violation 8s — ${state.carrier} n'a pas franchi la médiane`,
        },
      ],
    };
  }

  // Déplacer le porteur vers la médiane (= y plus bas en coord terrain)
  const dy = state.intent.targetY - carrierPos.y;
  const step = Math.max(-ADVANCE_STEP_PX, Math.min(ADVANCE_STEP_PX, dy));
  const newPos: Point = { x: carrierPos.x, y: carrierPos.y + step };

  // Médiane franchie : retour à idle, l'IA reprend
  if (newPos.y <= state.intent.targetY) {
    return {
      ...state,
      off: { ...state.off, [state.carrier]: newPos },
      ballPos: { x: newPos.x + 16, y: newPos.y - 16 },
      intent: { kind: 'idle' },
    };
  }

  // Encore en montée
  return {
    ...state,
    off: { ...state.off, [state.carrier]: newPos },
    ballPos: { x: newPos.x + 16, y: newPos.y - 16 },
    intent: {
      kind: 'advance',
      targetY: state.intent.targetY,
      advanceTimerMs: remaining,
    },
  };
}
