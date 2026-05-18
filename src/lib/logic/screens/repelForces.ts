// CVT Chantier 1.3 — Forces de répulsion `repel` autour des poseurs d'écran.
//
// Statut : **infrastructure pure, non câblée**. Aucun consommateur dans
// `defense/*` ni dans le pipeline screen. Le câblage (intégration dans
// `applyScreenAdjustment` ou en couche additive après `baseTargets`)
// sera une sous-étape 1.3b séparée pour valider l'interaction avec les
// tests `screens*` / `overlap*` sans surprise.
//
// Math : émission d'une force `repel` à falloff linéaire (cf. primitive
// dans `steeringEngine.ts`) avec rayon `MIN_PLAYER_CLEARANCE_PX +
// STEERING_SCREEN_REPEL_BUFFER_PX`. Hors du rayon → force morte
// (glissement fluide, jamais de mur). Cas dégénéré `from === screener`
// → force morte (le `constraintSolver.ts` reste filet dur — Règle 1).

import type { Point } from '../../types';
import {
  MIN_PLAYER_CLEARANCE_PX,
  STEERING_SCREEN_REPEL_BUFFER_PX,
  STEERING_SCREEN_REPEL_WEIGHT,
} from '../../data/physics';
import { repel, type SteeringForce } from '../steeringEngine';

/**
 * Rayon effectif de la force de répulsion autour d'un poseur d'écran.
 * Exporté pour permettre aux tests et aux futurs consommateurs de
 * raisonner sur la zone d'effet.
 */
export const SCREEN_REPEL_RADIUS_PX =
  MIN_PLAYER_CLEARANCE_PX + STEERING_SCREEN_REPEL_BUFFER_PX;

/**
 * Émet une force de répulsion radiale autour d'un poseur d'écran.
 * Rayon et poids fournis avec valeurs par défaut depuis `data/physics.ts`
 * pour faciliter le tuning ultérieur. Force morte si `defenderRef` est
 * hors du rayon (`SCREEN_REPEL_RADIUS_PX`) ou pile sur le poseur.
 */
export function screenerRepelForce(
  defenderRef: Point,
  screenerPos: Point,
  weight: number = STEERING_SCREEN_REPEL_WEIGHT,
  label: string = 'repel-screener',
  radius: number = SCREEN_REPEL_RADIUS_PX,
): SteeringForce {
  return repel(defenderRef, screenerPos, radius, weight, label);
}

/**
 * Variante batch : émet une force par poseur. Les forces mortes (hors
 * rayon) sont retournées mais ignorées par `accumulateForces`. Les
 * labels sont indexés pour faciliter le debug (`repel-screener-0`, etc.).
 */
export function screenersRepelForces(
  defenderRef: Point,
  screenerPositions: ReadonlyArray<Point>,
  weight: number = STEERING_SCREEN_REPEL_WEIGHT,
): SteeringForce[] {
  return screenerPositions.map((pos, i) =>
    screenerRepelForce(defenderRef, pos, weight, `repel-screener-${i}`),
  );
}
