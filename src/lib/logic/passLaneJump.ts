// P2.1 — Jump the passing lane. Helper pur : pendant le vol d'une passe
// (le porteur change entre les steps A et B), un défenseur proche de la
// ligne passeur→receveur fait un micro-pas DANS la ligne (tentative de
// déflection), puis revient. « Move on the pass, not on the catch ».
//
// Propriétés garanties (Règle 1bis-friendly) :
// - enveloppe sin(π·localT) → offset NUL aux deux bornes du segment :
//   les endpoints moteur (invariants step-level) sont strictement intacts ;
// - continu en t → pas de snap, compatible rate limiter playback ;
// - magnitude capée à la distance à la ligne → ne traverse jamais la ligne ;
// - le solveur de collisions aval (resolvePlayerCollisions) reste le filet
//   dur anti-superposition.

import type { Point } from '../types';
import { PASS_LANE_JUMP_MAX_PX, PASS_LANE_JUMP_RADIUS_PX } from '../data/physics';

export interface PassLaneJumpParams {
  /** Position courante (interpolée) du défenseur. */
  defender: Point;
  /** Position du passeur à l'endpoint A (stable sur le segment). */
  passer: Point;
  /** Position du receveur à l'endpoint B (stable sur le segment). */
  receiver: Point;
  /** Progression du segment = progression du vol du ballon (0..1). */
  localT: number;
}

/**
 * Offset {x, y} à AJOUTER à la position du défenseur. {0,0} si le défenseur
 * est hors rayon, déjà sur la ligne, aux bornes du vol, ou si le segment de
 * passe est dégénéré.
 */
export function passLaneJumpOffset({ defender, passer, receiver, localT }: PassLaneJumpParams): Point {
  const zero: Point = { x: 0, y: 0 };
  const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, localT)));
  if (envelope <= 1e-9) return zero;

  const dx = receiver.x - passer.x;
  const dy = receiver.y - passer.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return zero;

  // Point le plus proche du défenseur sur le SEGMENT passeur→receveur.
  const t = Math.max(0, Math.min(1, ((defender.x - passer.x) * dx + (defender.y - passer.y) * dy) / lenSq));
  const closest = { x: passer.x + dx * t, y: passer.y + dy * t };
  const toLaneX = closest.x - defender.x;
  const toLaneY = closest.y - defender.y;
  const dist = Math.hypot(toLaneX, toLaneY);
  if (dist < 1e-6 || dist >= PASS_LANE_JUMP_RADIUS_PX) return zero;

  // Falloff linéaire avec la proximité, enveloppe sin sur le vol, et cap à
  // la distance restante (le défenseur atteint la ligne, jamais au-delà).
  const magnitude = Math.min(
    dist,
    PASS_LANE_JUMP_MAX_PX * envelope * (1 - dist / PASS_LANE_JUMP_RADIUS_PX)
  );
  return { x: (toLaneX / dist) * magnitude, y: (toLaneY / dist) * magnitude };
}
