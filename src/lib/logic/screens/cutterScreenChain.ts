// Détection de la CHAÎNE D'ÉCRANS hors-ballon sur un même cutter (B9).
//
// Un shooter qui sort 2 (ou +) écrans d'affilée force la défense à
// chase plus agressivement à chaque utilisation. La couverture standard
// `top-lock` (verrouiller côté ballon) marche pour le 1er écran, mais
// au 2ᵉ le cutter est déjà décollé du verrouillage initial : il faut
// chase derrière lui (`chase` / `trail`) plutôt que de retomber sur le
// top-lock figé.
//
// Helper pur qui regarde les K derniers steps et compte combien
// d'écrans hors-ballon DISTINCTS impliquent ce cutter.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderPositions,
  Point,
} from '../../types';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import {
  computeDefenseTargets,
  extractDefenderPositions,
  getMatchupsAt,
} from '../engine';
import { detectOffBallScreens } from './detectOffBallScreens';
import { initialDef } from '../../data/initial';

const DEFAULT_DEPTH = 3;

/**
 * Compte les écrans hors-ballon impliquant `cutter` dans les K derniers
 * steps (inclus le step courant). Stoppe à step 0.
 *
 * Critère d'inclusion : il existe un écran hors-ballon dont `screen.cutter`
 * === `cutter`. Pas de dédup sur le poseur — deux écrans posés par des
 * coéquipiers différents comptent comme 2.
 */
export function countCutterScreenChain(
  state: AppState,
  stepIdx: number,
  cutter: AttackerId,
  depth: number = DEFAULT_DEPTH
): number {
  let count = 0;
  const startIdx = Math.max(0, stepIdx - depth + 1);
  for (let i = startIdx; i <= stepIdx; i++) {
    const step = state.steps[i];
    if (!step) continue;
    const off = activeOffense(step.off, state.playerCount);
    const ballCarrier = activeBallCarrier(step, state.playerCount);
    const matchups = getMatchupsAt(state.steps, i - 1, state.playerCount);
    const defPos: DefenderPositions = i === 0
      ? activeDefenseInitial(state.defenseInitial, state.playerCount)
      : extractDefenderPositions(computeDefenseTargets(state, i - 1).positions);
    const prevOff: AttackerPositions | undefined =
      i > 0 ? activeOffense(state.steps[i - 1].off, state.playerCount) : undefined;
    const screens = detectOffBallScreens(
      off,
      ballCarrier,
      matchups,
      defPos,
      state.screenRadius,
      prevOff
    );
    if (screens.some((s) => s.cutter === cutter)) {
      count++;
    }
  }
  return count;
}

/** Mini ré-implémentation locale d'activeDefenseInitial pour éviter d'importer
 *  players.ts qui crée potentiellement des deps circulaires sur computeDefenseTargets. */
function activeDefenseInitial(
  defenseInitial: DefenderPositions,
  playerCount: AppState['playerCount']
): DefenderPositions {
  const active = new Set<string>(getActiveDefenderIds(playerCount));
  const out: Record<string, Point> = {};
  Object.entries(defenseInitial).forEach(([d, p]) => {
    if (active.has(d)) out[d] = p;
  });
  // Fallback pour les défenseurs actifs qui n'auraient pas de slot.
  active.forEach((d) => {
    if (!(d in out)) out[d] = (initialDef as Record<string, Point>)[d];
  });
  return out as DefenderPositions;
}

/**
 * Compute le SET des cutters qui sont dans une "chaîne" (≥ 2 écrans
 * récents). Utilisé pour basculer dynamiquement `top-lock` → `chase`
 * dans la couche défensive.
 */
export function cuttersInScreenChain(
  state: AppState,
  stepIdx: number,
  candidates: AttackerId[],
  depth: number = DEFAULT_DEPTH,
  threshold: number = 2
): Set<AttackerId> {
  const set = new Set<AttackerId>();
  for (const c of candidates) {
    if (countCutterScreenChain(state, stepIdx, c, depth) >= threshold) {
      set.add(c);
    }
  }
  return set;
}
