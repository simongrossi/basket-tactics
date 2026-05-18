// A11 V1 — Helpers purs pour le tracking de tirs et préparation du rebond.
//
// Module utilitaire qui centralise :
//   - getShotPosForStep : récupère la position du tir (explicite si
//     défini, sinon position du porteur)
//   - hasShotOutcome    : test sémantique simple
//
// Module pur : aucun side effect, aucun accès à random ni à l'AppState.

import type { Point, Step } from '../types';
import { activeBallCarrier } from './players';

/**
 * Position du tir au step donné.
 * - Si `step.shotPos` est défini, le renvoie tel quel.
 * - Sinon, retourne la position du porteur de balle (= position naturelle).
 * - Retourne `null` si pas de porteur (cas dégénéré).
 *
 * Utilisé par `buildShotReboundSetup` (Phase 2) pour pondérer le rebond
 * selon la zone du tir.
 */
export function getShotPosForStep(step: Step, playerCount: number): Point | null {
  if (step.shotPos) return { x: step.shotPos.x, y: step.shotPos.y };
  const carrier = activeBallCarrier(step, playerCount);
  if (!carrier) return null;
  const pos = step.off[carrier];
  if (!pos) return null;
  return { x: pos.x, y: pos.y };
}

/** True si le step porte un outcome de tir. */
export function hasShotOutcome(step: Step): boolean {
  return step.shotOutcome === 'made' || step.shotOutcome === 'missed';
}

/** True si le step a un tir manqué (= candidat à un step rebond). */
export function isMissedShot(step: Step): boolean {
  return step.shotOutcome === 'missed';
}
