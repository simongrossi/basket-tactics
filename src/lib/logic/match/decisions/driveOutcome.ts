// 2b.1 — Décideur pur d'issue de drive dans le match-sim.
//
// Consomme le verdict géométrique de `evaluateDriveContainment` (cœur pur
// livré en 2a) et le traduit en issue de jeu :
//
//   beaten    → 'continue'  (défenseur battu, le drive va au cercle — flux actuel)
//   contained → 'pullup'    (ligne coupée, le porteur s'arrête en tir mi-distance)
//   walled    → 'strip' (proba STRIP_PROBABILITY) sinon 'kickout' (ressortie)
//
// La charge (faute offensive sur défenseur établi) est hors scope 2b.1 —
// elle arrive en 2b.3, après le système de fautes 2b.2.
//
// Spec : docs/superpowers/specs/2026-06-03-drive-outcomes-matchsim-design.md

import type { ContainmentLevel } from '../../driveContainment';

export type DriveOutcome = 'continue' | 'pullup' | 'kickout' | 'strip';

/** Petite proba qu'un drive 'walled' devienne un strip (sinon kick-out).
 *  Calibrable — recalibrage fin via autoTuning/calibration si besoin. */
export const STRIP_PROBABILITY = 0.12;

export function resolveDriveOutcome(
  level: ContainmentLevel,
  rng: () => number,
): DriveOutcome {
  if (level === 'beaten') return 'continue';
  if (level === 'contained') return 'pullup';
  // walled : duel au point de contain — petite proba de ballon arraché,
  // sinon le porteur ressort la balle.
  return rng() < STRIP_PROBABILITY ? 'strip' : 'kickout';
}
