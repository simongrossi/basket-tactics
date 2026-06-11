// Helpers partagés de la game loop : clones, géométrie locale, refresh
// défense et cibles de box-out.
//
// Extraits de `gameLoop.ts` (découpe 2026-06-11, refacto bit-identique).

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
  Step,
} from '@/lib/types';
import { effectiveDefensePositions } from '../../engine';
import { BOXOUT_OFFSET_PX } from './constants';
import type { MatchState } from './types';

/** Construit un ComputedDefense minimal à partir de positions brutes.
 *  Phase 2 — utilisé lors du swap quand on rebalance state.defPos sans
 *  passer par le pipeline défense complet (qui assumerait home attaque). */
export function buildMinimalDefense(
  positions: Record<DefenderId, Point>,
  attackerIds: AttackerId[],
  defenderIds: DefenderId[]
): ComputedDefense {
  const result = {} as ComputedDefense;
  defenderIds.forEach((dId, i) => {
    const p = positions[dId] ?? { x: 300, y: 540 };
    const matched = attackerIds[i] ?? attackerIds[0];
    // Defaults visuels neutres (orientation = sud / vers le panier opposé,
    // regard vers le porteur — calculé en V3 via le pipeline visuel adapté.
    // Pour V2 V0, placeholders cohérents).
    const facingPoint: Point = { x: p.x, y: p.y - 30 };
    result[dId] = {
      x: p.x,
      y: p.y,
      late: false,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: matched,
      onScreen: false,
      switchedThisStep: false,
      orientation: 0,
      gazeOrientation: 0,
      facing: facingPoint,
      armBallSide: facingPoint,
      armManSide: facingPoint,
    };
  });
  return result;
}

export function computeBoxOutTargets(
  state: MatchState,
  hoop: Point
): Partial<Record<DefenderId, Point>> {
  const targets: Partial<Record<DefenderId, Point>> = {};
  (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
    const def = state.defPos[id];
    if (!def) return;
    const matchedAtt = state.off[def.matchedTo as AttackerId];
    if (!matchedAtt) return;
    const dx = hoop.x - matchedAtt.x;
    const dy = hoop.y - matchedAtt.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      targets[id] = { x: def.x, y: def.y };
      return;
    }
    targets[id] = {
      x: matchedAtt.x + (dx / d) * BOXOUT_OFFSET_PX,
      y: matchedAtt.y + (dy / d) * BOXOUT_OFFSET_PX,
    };
  });
  return targets;
}

export function refreshDefense(state: MatchState, baseAppState: AppState): void {
  // Pour rester simple en V1, on recompute en injectant les positions
  // courantes dans un step synthétique. Coûteux à 5 Hz × scénarios
  // complexes — à optimiser via cache segmentaire en V2.
  const syntheticStep: Step = {
    ...baseAppState.steps[baseAppState.activeStep],
    off: state.off,
    ballCarrier: state.carrier,
    annotations: [],
  };
  const syntheticState: AppState = {
    ...baseAppState,
    steps: [...baseAppState.steps.slice(0, baseAppState.activeStep), syntheticStep],
    activeStep: baseAppState.activeStep,
  };
  state.defPos = effectiveDefensePositions(syntheticState, baseAppState.activeStep);
}

export function ballAt(carrierPos: Point): Point {
  return { x: carrierPos.x + 16, y: carrierPos.y - 16 };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function parabolaArc(progress: number, totalDist: number): number {
  // Arc parabolique pour la passe : pic à progress=0.5.
  const height = Math.min(80, totalDist * 0.18);
  return 4 * height * progress * (1 - progress);
}

export function cloneOff(off: AttackerPositions): AttackerPositions {
  const out = {} as AttackerPositions;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const p = off[id];
    if (p) out[id] = { x: p.x, y: p.y };
  });
  return out;
}

export function cloneDef(def: ComputedDefense): ComputedDefense {
  const out = {} as ComputedDefense;
  (Object.keys(def) as DefenderId[]).forEach((id) => {
    out[id] = { ...def[id] };
  });
  return out;
}
