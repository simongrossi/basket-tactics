import type { Point, CarrierBehavior, OffBallStance } from '../types';
import { HOOP, THREE_POINT_RADIUS } from '../data/court';
import {
  MIN_PLAYER_CLEARANCE_PX,
  STEERING_MAN_SLOWING_RADIUS_PX,
} from '../data/physics';
import { clamp, distance } from './geometry';
import { arrive, type SteeringForce } from './steeringEngine';

/** Décalage latéral en x à appliquer à la position cible du défenseur selon
 *  sa rotation (en degrés). Positif = défenseur shifté à droite (ferme côté
 *  droit), négatif = à gauche. Magnitude max ~12px à ±90°, proportionnelle
 *  à sin(angle) pour un effet naturel. */
export function orientationLateralOffset(orientationDeg: number): number {
  const rad = (orientationDeg * Math.PI) / 180;
  return Math.sin(rad) * 12;
}

/**
 * Position cible d'un défenseur en marquage classique :
 * sur la ligne homme-panier, à `distance` pixels devant son homme.
 *
 * `hoop` : panier de référence côté défense (default = HOOP top). Permet
 * d'inverser le sens d'attaque en passant HOOP_OPPOSITE.
 */
export function manTarget(att: Point | undefined, distance: number, hoop: Point = HOOP): Point | null {
  if (!att) return null;
  const dx = att.x - hoop.x;
  const dy = att.y - hoop.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ratio = Math.max(0, (dist - distance) / dist);
  return { x: hoop.x + dx * ratio, y: hoop.y + dy * ratio };
}

export function carrierDefenderTarget(
  vsCarrier: CarrierBehavior,
  att: Point | undefined,
  defenseDistance: number,
  hoop: Point = HOOP
): Point | null {
  if (!att) return null;
  const dx = att.x - hoop.x;
  const dy = att.y - hoop.y;
  const dist = Math.hypot(dx, dy) || 1;

  const normalizedDist = clamp(dist / THREE_POINT_RADIUS, 0, 1.5);
  const pressureFactor = 1 + (1 - normalizedDist) * 0.8;

  let baseRatio: number;
  let bumpOffset = 0;

  let lateralOffset = 0;
  switch (vsCarrier) {
    case 'coller':
      baseRatio = 0.4;
      break;
    case 'bumper':
      baseRatio = 0.25;
      bumpOffset = 8;
      break;
    case 'contester':
      baseRatio = 0.7;
      break;
    case 'reculer':
      baseRatio = 1.3;
      break;
    case 'topside':
      baseRatio = 0.4;
      lateralOffset = 14; // pousse vers le côté ligne de fond → milieu
      break;
    case 'baseline':
      baseRatio = 0.4;
      lateralOffset = -14; // force le porteur côté ligne de fond
      break;
  }

  // Distance minimale pour que les cercles ne se superposent pas visuellement
  // (cf. data/physics.ts : 2 × PLAYER_RADIUS + 2).
  const targetDist = Math.max(MIN_PLAYER_CLEARANCE_PX, (baseRatio * defenseDistance) / pressureFactor);

  const ratio = Math.max(0, (dist - targetDist) / dist);
  // Décalage latéral : perpendiculaire à l'axe homme-panier, signé
  // selon le côté du porteur (+ vers le centre du terrain en haut/bas)
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const sideSign = att.x >= hoop.x ? 1 : -1;
  return {
    x: hoop.x + dx * ratio - (dx / dist) * bumpOffset + perpX * lateralOffset * sideSign,
    y: hoop.y + dy * ratio - (dy / dist) * bumpOffset + perpY * lateralOffset * sideSign,
  };
}

/**
 * Position cible d'un défenseur HORS-BALLON selon sa stance off-ball.
 * - 'sag' / undefined : entre attaquant et panier (manTarget classique)
 * - 'behind' : strictement entre attaquant et panier, sans biais d'aide
 * - 'deny-3q' : 3/4 ball-side — un pied dans la ligne de passe
 * - 'fronting' : entre attaquant et ballon (full denial / face-guard)
 * - 'stunt' : fake d'aide vers le ballon, moins agressif que deny-3q (le
 *   défenseur menace de doubler puis revient sur son homme à l'étape suivante)
 */
export function offBallStanceTarget(
  att: Point | undefined,
  ball: Point | undefined,
  defenseDistance: number,
  stance: OffBallStance,
  hoop: Point = HOOP
): Point | null {
  if (!att) return null;
  if (!ball || stance === 'sag' || stance === 'behind') {
    return manTarget(att, defenseDistance, hoop);
  }

  // Position "behind" (entre attaquant et panier)
  const dxB = hoop.x - att.x;
  const dyB = hoop.y - att.y;
  const dB = Math.hypot(dxB, dyB) || 1;
  const behind = {
    x: att.x + (dxB / dB) * defenseDistance,
    y: att.y + (dyB / dB) * defenseDistance,
  };

  // Position "fronting" (entre attaquant et ballon)
  const dxF = ball.x - att.x;
  const dyF = ball.y - att.y;
  const dF = Math.hypot(dxF, dyF) || 1;
  const front = {
    x: att.x + (dxF / dF) * defenseDistance,
    y: att.y + (dyF / dF) * defenseDistance,
  };

  // Blend : 1 = full devant ballon, 0 = entre homme et panier
  let blend: number;
  switch (stance) {
    case 'fronting': blend = 1; break;
    case 'deny-3q': blend = 0.75; break;
    case 'stunt': blend = 0.4; break; // moins agressif, plus proche du behind
    default: blend = 0;
  }
  return {
    x: behind.x + (front.x - behind.x) * blend,
    y: behind.y + (front.y - behind.y) * blend,
  };
}

// ============================================================================
// CVT — Variants forces vectorielles (sous-étape 1.1, opt-in)
// ============================================================================
//
// Émetteurs `SteeringForce[]` consommables via `composeTarget(defenderPos, forces)`.
//
// Stratégie de migration : double-sortie sous flag `state.useSteeringEngine`.
//
// Sous-étape 1.1 (livré) : un unique `seek` à poids = distance,
// bit-équivalent au legacy.
//
// Sous-étape 1.1b (livré) : `arrive` (rampe linéaire dans
// `STEERING_MAN_SLOWING_RADIUS_PX`) au lieu de `seek` :
// - Loin de la cible (`dist ≥ slowingRadius`) → magnitude = dist,
//   `composeTarget` reproduit exactement le `Point` legacy.
// - Proche de la cible (`dist < slowingRadius`) → magnitude = dist²/radius,
//   `composeTarget` produit un target **dampé** (lande short of legacy),
//   ce qui annule les micro-oscillations entre frames. Effet visible
//   uniquement quand le défenseur est déjà "essentiellement arrivé"
//   (≤ 12 px). Écart max = `slowingRadius/4 ≈ 3 px`.

/**
 * Forces équivalentes à `manTarget(att, distance, hoop)` avec
 * dampening `arrive` près de la cible. Bit-équivalent en zone "loin",
 * amorti dans `STEERING_MAN_SLOWING_RADIUS_PX`. Retourne `[]` si `att`
 * est undefined ou si `defenderPos === target` exact (force morte).
 */
export function manTargetForces(
  defenderPos: Point,
  att: Point | undefined,
  defenseDistance: number,
  hoop: Point = HOOP,
  slowingRadius: number = STEERING_MAN_SLOWING_RADIUS_PX,
): SteeringForce[] {
  const target = manTarget(att, defenseDistance, hoop);
  if (!target) return [];
  const w = distance(defenderPos, target);
  if (w < 1e-6) return [];
  return [arrive(defenderPos, target, slowingRadius, w, 'arrive-man')];
}

/** Forces équivalentes à `carrierDefenderTarget(...)`. Cf. `manTargetForces`. */
export function carrierDefenderTargetForces(
  defenderPos: Point,
  vsCarrier: CarrierBehavior,
  att: Point | undefined,
  defenseDistance: number,
  hoop: Point = HOOP,
  slowingRadius: number = STEERING_MAN_SLOWING_RADIUS_PX,
): SteeringForce[] {
  const target = carrierDefenderTarget(vsCarrier, att, defenseDistance, hoop);
  if (!target) return [];
  const w = distance(defenderPos, target);
  if (w < 1e-6) return [];
  return [arrive(defenderPos, target, slowingRadius, w, `arrive-carrier-${vsCarrier}`)];
}

/** Forces équivalentes à `offBallStanceTarget(...)`. Cf. `manTargetForces`. */
export function offBallStanceTargetForces(
  defenderPos: Point,
  att: Point | undefined,
  ball: Point | undefined,
  defenseDistance: number,
  stance: OffBallStance,
  hoop: Point = HOOP,
  slowingRadius: number = STEERING_MAN_SLOWING_RADIUS_PX,
): SteeringForce[] {
  const target = offBallStanceTarget(att, ball, defenseDistance, stance, hoop);
  if (!target) return [];
  const w = distance(defenderPos, target);
  if (w < 1e-6) return [];
  return [arrive(defenderPos, target, slowingRadius, w, `arrive-offball-${stance}`)];
}
