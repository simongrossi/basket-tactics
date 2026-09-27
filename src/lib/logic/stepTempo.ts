// Tempo selon la distance (audit réalisme 2026-09-27, correctif 3).
//
// Sans durée explicite (`step.duration` ou `state.secondsPerStep`), une étape
// durait 4 s quel que soit son contenu : les courses dessinées (3 à 8 m) se
// jouaient à la marche. Ici, la durée de la transition N → N+1 découle de la
// plus longue course d'attaquant de l'étape, à la vitesse d'une action de jeu
// (drive, coupe ≈ 4 m/s), en tenant compte de la fenêtre de temps de
// l'annotation (une coupe sur [0,3 ; 1] doit tenir dans 70 % de l'étape).
// Bornée pour garder le temps de lire une passe ou un écran, et de ne jamais
// dépasser l'ancien défaut.
//
// Pur ; mémoïsé par tableau d'étapes (une édition crée un nouveau tableau).

import { PX_PER_M } from '../data/court';
import type { AppState, AttackerId, Point, Step } from '../types';

/** Vitesse d'une action offensive (drive, coupe), m/s. */
export const TEMPO_ACTION_SPEED_MPS = 3.5;
/** Temps de lecture / d'appui ajouté à la course (s). */
export const TEMPO_REACTION_SECONDS = 0.6;
/** Durée minimale d'une étape (passe, écran posé), s. */
export const TEMPO_MIN_SECONDS = 1.8;
/** Durée maximale : jamais plus que l'ancien défaut. */
export const TEMPO_MAX_SECONDS = 4;
/** Longueur d'une passe au-delà de laquelle le vol du ballon compte (m/s). */
const TEMPO_PASS_SPEED_MPS = 10;

const cache = new WeakMap<Step[], Map<number, number>>();

function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

function near(a: Point | undefined, b: Point, tol = 30): boolean {
  return !!a && Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

/**
 * Durée (s) de la transition `stepIdx → stepIdx + 1` déduite des distances à
 * courir. `undefined` pour la dernière étape (pas de transition).
 */
export function distanceTempoSeconds(steps: Step[], stepIdx: number): number | undefined {
  const cur = steps[stepIdx];
  // Étapes interpolées : elles subdivisent la transition vers l'étape réelle
  // suivante, qui donne les positions d'arrivée.
  let nextIdx = stepIdx + 1;
  while (steps[nextIdx]?.isInterpolated) nextIdx++;
  const next = steps[nextIdx];
  if (!cur || !next) return undefined;
  let byStep = cache.get(steps);
  if (!byStep) {
    byStep = new Map();
    cache.set(steps, byStep);
  }
  const hit = byStep.get(stepIdx);
  if (hit !== undefined) return hit;

  let needed = 0;
  (Object.keys(cur.off) as AttackerId[]).forEach((id) => {
    const from = cur.off[id];
    const to = next.off[id];
    if (!from || !to) return;
    let len = Math.hypot(to.x - from.x, to.y - from.y);
    let window = 1;
    // Annotation de mouvement de l'étape : tracé réel (waypoints) et fenêtre.
    const ann = cur.annotations.find((a) =>
      a.fromId === id && a.type !== 'pass' && near(from, a.from));
    if (ann) {
      len = Math.max(len, pathLength([ann.from, ...(ann.waypoints ?? []), ann.to]));
      const tStart = typeof ann.tStart === 'number' ? ann.tStart : 0;
      const tEnd = typeof ann.tEnd === 'number' ? ann.tEnd : 1;
      window = Math.max(0.25, Math.min(1, tEnd - tStart));
    }
    needed = Math.max(needed, len / PX_PER_M / TEMPO_ACTION_SPEED_MPS / window);
  });
  cur.annotations.forEach((a) => {
    if (a.type !== 'pass') return;
    const len = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) / PX_PER_M;
    needed = Math.max(needed, len / TEMPO_PASS_SPEED_MPS);
  });
  const seconds = Math.min(TEMPO_MAX_SECONDS,
    Math.max(TEMPO_MIN_SECONDS, needed + TEMPO_REACTION_SECONDS));
  const rounded = Math.round(seconds * 10) / 10;
  byStep.set(stepIdx, rounded);
  return rounded;
}

/** Le tempo automatique s'applique-t-il à cet état ? (aucune durée
 *  explicite globale). La durée d'étape explicite reste prioritaire. */
export function usesDistanceTempo(state: AppState, enabled: boolean): boolean {
  return enabled && !state.realSpeedMode &&
    (typeof state.secondsPerStep !== 'number' || !isFinite(state.secondsPerStep) || state.secondsPerStep <= 0);
}
