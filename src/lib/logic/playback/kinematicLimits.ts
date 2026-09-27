// Cinématique en unités réelles (audit réalisme 2026-09-27, correctifs 1 et 2).
//
// Le limiteur anti-saut historique du frameResolver borne le déplacement par
// SOUS-PAS canonique (9 px), donc une vitesse qui dépend de la durée d'étape
// (3,65 m/s à 4 s, 7,3 m/s à 2 s) et des accélérations qui grandissent avec
// le carré du tempo. Ce module exprime la même contrainte en m/s et m/s², avec
// le dt réel du sous-pas :
//   - vitesse maximale selon l'appui (face / pas chassé / reculons) et
//     sprint autorisé en repli, closeout ou rotation ;
//   - accélération bornée depuis la vitesse du sous-pas précédent, y compris
//     au changement d'étape (départ à l'arrêt progressif) ;
//   - freinage anticipé : la vitesse est bornée par celle de la place visée
//     plus √(2·b·écart), le joueur ralentit en arrivant au lieu de piler.
// Attaquants : plafond de vitesse seulement (retarder un attaquant sur son
// tracé désaligne la géométrie des écrans et des passes).
//
// Pur ; le garde-fou anti-saut en pixels reste appliqué par l'appelant (il
// devient un plafond qui ne mord qu'aux tempos longs).

import { PX_PER_M } from '../../data/court';
import type { Point } from '../../types';
import { headingDeg } from '../defense/pursuitModulators';

/** Défenseur, course de face (m/s). */
export const DEFENDER_FORWARD_MAX_MPS = 7;
/** Défenseur, sprint de repli / closeout / rotation (m/s). */
export const DEFENDER_SPRINT_MAX_MPS = 8;
/** Défenseur, pas chassé (m/s). */
export const DEFENDER_LATERAL_MAX_MPS = 4;
/** Défenseur, course à reculons (m/s). */
export const DEFENDER_BACKPEDAL_MAX_MPS = 4.5;
/** Défenseur, accélération (m/s²). */
export const DEFENDER_ACCEL_MPS2 = 6;
/** Freinage anticipé (m/s²). */
export const PLAYER_DECEL_MPS2 = 9;
/** Attaquant, vitesse de pointe (m/s). */
export const ATTACKER_SPRINT_MAX_MPS = 8;
/** Retard sur sa place (m) au-delà duquel le défenseur se retourne et court :
 *  le plafond du pas chassé / des reculons ne s'applique plus. */
export const TURN_AND_RUN_GAP_M = 1.5;

export interface KinematicMemory {
  /** Vitesse réelle au sous-pas précédent (px/s). */
  speedPxPerSec: number;
  /** Place visée (avant limitation) au sous-pas précédent. */
  target?: Point;
}

export interface KinematicLimitInput {
  prev: Point;
  /** Place visée à cet instant (sortie du moteur, avant limitation). */
  target: Point;
  dtSec: number;
  memory?: KinematicMemory;
  /** Plafond de vitesse (m/s) déjà choisi selon le mode. */
  maxSpeedMps: number;
  accelMps2: number;
  decelMps2?: number;
}

/** Distance maximale (px) parcourable sur ce sous-pas. */
export function kinematicMaxStepPx(input: KinematicLimitInput): number {
  const { prev, target, dtSec, memory } = input;
  const decel = (input.decelMps2 ?? PLAYER_DECEL_MPS2) * PX_PER_M;
  const previousSpeed = memory?.speedPxPerSec ?? 0;
  const gap = Math.hypot(target.x - prev.x, target.y - prev.y);
  const targetSpeed = memory?.target
    ? Math.hypot(target.x - memory.target.x, target.y - memory.target.y) / dtSec
    : 0;
  const cap = input.maxSpeedMps * PX_PER_M;
  const ramp = previousSpeed + input.accelMps2 * PX_PER_M * dtSec;
  const brake = targetSpeed + Math.sqrt(2 * decel * gap);
  return Math.min(cap, ramp, brake) * dtSec;
}

/** Écart angulaire absolu (0..180°). */
function angleGap(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Plafond de vitesse d'un défenseur selon l'appui : de face jusqu'à 45° du
 * corps, pas chassé à 90°, reculons au-delà de 135°, interpolé entre deux.
 * Sprint autorisé (repli, closeout, rotation) ; au-delà de
 * TURN_AND_RUN_GAP_M de retard, le défenseur se retourne et court de face.
 */
export function defenderSpeedCapMps(params: {
  moveDx: number;
  moveDy: number;
  bodyDeg?: number;
  gapPx: number;
  sprint: boolean;
}): number {
  const forward = params.sprint ? DEFENDER_SPRINT_MAX_MPS : DEFENDER_FORWARD_MAX_MPS;
  if (params.bodyDeg == null || params.gapPx > TURN_AND_RUN_GAP_M * PX_PER_M) return forward;
  if (Math.hypot(params.moveDx, params.moveDy) < 1e-6) return forward;
  const rel = angleGap(headingDeg(params.moveDx, params.moveDy), params.bodyDeg);
  if (rel <= 45) return forward;
  if (rel <= 90) return forward + (DEFENDER_LATERAL_MAX_MPS - forward) * ((rel - 45) / 45);
  if (rel <= 135) {
    return DEFENDER_LATERAL_MAX_MPS + (DEFENDER_BACKPEDAL_MAX_MPS - DEFENDER_LATERAL_MAX_MPS) * ((rel - 90) / 45);
  }
  return DEFENDER_BACKPEDAL_MAX_MPS;
}

/** Ramène `target` sur le segment prev → target à `maxStepPx` au plus. */
export function clampStep(prev: Point, target: Point, maxStepPx: number): Point {
  const dx = target.x - prev.x;
  const dy = target.y - prev.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStepPx || d < 1e-9) return { x: target.x, y: target.y };
  const k = Math.max(0, maxStepPx) / d;
  return { x: prev.x + dx * k, y: prev.y + dy * k };
}

/** Attaquant sans annotation : accélération du profil départ / arrêt (m/s²). */
export const ATTACKER_IDLE_ACCEL_MPS2 = 4;

/**
 * Remap temporel d'un déplacement rectiligne `distM` sur `durationSec` :
 * rampe d'accélération `accelMps2` au départ si le joueur part de l'arrêt,
 * rampe de freinage à l'arrivée s'il s'y arrête, vitesse constante entre les
 * deux (profil trapézoïdal). Sans arrêt de part ni d'autre : identité (la
 * vitesse reste continue avec les étapes voisines). Si la durée est trop
 * courte pour cette accélération, profil triangulaire (accélération minimale
 * qui tient dans la durée). Retourne la fraction parcourue ∈ [0, 1].
 */
export function restToRestProgress(params: {
  localT: number;
  distM: number;
  durationSec: number;
  accelMps2: number;
  startsFromRest: boolean;
  stopsAtEnd: boolean;
}): number {
  const t01 = Math.max(0, Math.min(1, params.localT));
  const ramps = (params.startsFromRest ? 1 : 0) + (params.stopsAtEnd ? 1 : 0);
  const T = params.durationSec;
  const d = params.distM;
  if (ramps === 0 || d < 1e-3 || !(T > 0)) return t01;
  // d = v·(T − ramps·τ/2), τ = v/a  →  v²·ramps/(2a) − v·T + d = 0.
  let a = params.accelMps2;
  let disc = T * T - (2 * ramps * d) / a;
  if (disc < 0) {
    a = (2 * ramps * d) / (T * T);
    disc = 0;
  }
  const v = ((T - Math.sqrt(disc)) * a) / ramps;
  const tau = v / a;
  const tauStart = params.startsFromRest ? tau : 0;
  const tauEnd = params.stopsAtEnd ? tau : 0;
  const t = t01 * T;
  let x: number;
  if (t < tauStart) x = 0.5 * a * t * t;
  else if (t > T - tauEnd) x = d - 0.5 * a * (T - t) * (T - t);
  else x = 0.5 * a * tauStart * tauStart + v * (t - tauStart);
  return Math.max(0, Math.min(1, x / d));
}
