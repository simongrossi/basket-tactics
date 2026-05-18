// Moteur de forces vectorielles (Steering Behaviors) — Chantier 1 CVT.
//
// Infrastructure pure et déterministe pour piloter les défenseurs par
// **forces vectorielles pondérées** (paradigme émergeant) au lieu de
// cibles absolues rigides (paradigme actuel). Voir ROADMAP.md §
// "Refonte cinématique vectorielle tactique" et docs/GAME-ENGINE.md.
//
// Statut : **infra pure non câblée**. Aucun consommateur dans
// `defense/*`, `engine.ts` ou `constraintSolver.ts` à cette étape.
// Math pur, aucune mutation, aucun état caché.

import type { Point } from '../types';
import { clamp, distance, normalize } from './geometry';

/**
 * Force vectorielle pondérée émise par une couche défensive.
 *
 * - `direction` : vecteur normalisé (|direction| ≤ 1). Le vecteur nul
 *   `{x:0, y:0}` représente une **force morte** (primitive inactive
 *   dans le contexte courant, ex: hors rayon d'un `repel`).
 * - `weight` : poids scalaire ≥ 0. Une force avec `weight = 0` est
 *   ignorée par l'accumulateur.
 * - `label` : étiquette de debug/diagnostic (ex: `'seek-man-O3'`,
 *   `'repel-screener-D5'`). Non utilisée par le math.
 */
export interface SteeringForce {
  direction: Point;
  weight: number;
  label: string;
}

const DEAD_FORCE = (label: string): SteeringForce => ({
  direction: { x: 0, y: 0 },
  weight: 0,
  label,
});

/**
 * Force d'**attraction** vers `target`. Direction unitaire,
 * `weight = weight` fourni. Force morte si `weight ≤ 0` ou si
 * `from === target` (distance < ε).
 */
export function seek(
  from: Point,
  target: Point,
  weight: number,
  label: string,
): SteeringForce {
  if (weight <= 0) return DEAD_FORCE(label);
  const d = distance(from, target);
  if (d < 1e-6) return DEAD_FORCE(label);
  return {
    direction: normalize({ x: target.x - from.x, y: target.y - from.y }),
    weight,
    label,
  };
}

/**
 * Force de **répulsion** radiale depuis `obstacle`. Magnitude modulée
 * par une rampe linéaire `(1 − dist/radius)` clampée à [0,1]. Hors du
 * rayon → force morte (glissement fluide, pas de mur).
 *
 * - Cas dégénéré `from === obstacle` (superposition pure) : retourne
 *   force morte. Le `constraintSolver.ts` reste le filet de sécurité
 *   dur pour la Règle 1 (clearance inviolable).
 */
export function repel(
  from: Point,
  obstacle: Point,
  radius: number,
  weight: number,
  label: string,
): SteeringForce {
  if (weight <= 0 || radius <= 0) return DEAD_FORCE(label);
  const d = distance(from, obstacle);
  if (d < 1e-6) return DEAD_FORCE(label);
  if (d >= radius) return DEAD_FORCE(label);
  const falloff = clamp(1 - d / radius, 0, 1);
  return {
    direction: normalize({ x: from.x - obstacle.x, y: from.y - obstacle.y }),
    weight: weight * falloff,
    label,
  };
}

/**
 * Force d'**arrivée** : `seek` modulé par une rampe linéaire de
 * décélération `min(1, dist/slowingRadius)`. Tue les oscillations
 * autour de la cible (anti-bug du marquage strict).
 *
 * - Hors du `slowingRadius` : équivalent à `seek` (rampe = 1).
 * - À la cible : force morte (rampe = 0).
 */
export function arrive(
  from: Point,
  target: Point,
  slowingRadius: number,
  weight: number,
  label: string,
): SteeringForce {
  if (weight <= 0 || slowingRadius <= 0) return DEAD_FORCE(label);
  const d = distance(from, target);
  if (d < 1e-6) return DEAD_FORCE(label);
  const ramp = clamp(d / slowingRadius, 0, 1);
  return {
    direction: normalize({ x: target.x - from.x, y: target.y - from.y }),
    weight: weight * ramp,
    label,
  };
}

/**
 * Accumulateur additif (Reynolds) : `Σ (W_i · F_i)`.
 *
 * Composition **purement additive** sans priorité ni truncation
 * individuelle. Commutatif (ordre indépendant). Retourne le vecteur
 * résultant **non normalisé** : c'est `integrateForce` qui clampe
 * ensuite la magnitude au pas de temps autorisé.
 */
export function accumulateForces(forces: ReadonlyArray<SteeringForce>): Point {
  let x = 0;
  let y = 0;
  for (const f of forces) {
    if (f.weight <= 0) continue;
    x += f.direction.x * f.weight;
    y += f.direction.y * f.weight;
  }
  return { x, y };
}

/**
 * Intégration vers une position cible : `current + clamp(force, maxStep)`.
 *
 * Clampe la magnitude du déplacement à `maxStep` (anti-téléportation).
 * Pas de friction, pas d'inertie — c'est `defense/speedConstraint.ts`
 * et `constraintSolver.ts` qui prendront le relais quand on branchera
 * ce moteur au pipeline défensif.
 */
export function integrateForce(
  current: Point,
  force: Point,
  maxStep: number,
): Point {
  if (maxStep <= 0) return current;
  const mag = Math.hypot(force.x, force.y);
  if (mag < 1e-6) return current;
  const k = mag > maxStep ? maxStep / mag : 1;
  return { x: current.x + force.x * k, y: current.y + force.y * k };
}
