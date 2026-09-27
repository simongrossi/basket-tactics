// Repli défensif en transition — priorités enseignées :
//  1. Arrêter le ballon : le défenseur qui peut se placer le plus vite entre
//     le porteur et le panier le prend, quel que soit son homme.
//  2. Protéger le panier : le suivant file sous le cercle.
//  3. Premier attaquant disponible (cross-matching) : les autres prennent les
//     attaquants restants, les plus dangereux (près du panier) d'abord. Si
//     un attaquant reste sans défenseur, c'est le plus loin du panier (le
//     trailer) — nominalement confié au défenseur du cercle.
//
// Actif sur les étapes `step.transitionDefense` (posé par le fast-break).
// Point de départ : positions réelles de l'étape précédente. Pur ; les
// collisions sont résolues en aval (effectiveDefensePositions).

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Matchups,
  Point,
} from '../../types';
import { MIDLINE_Y } from '../../data/court';
import { manTarget } from '../manDefense';
import { computeDefenderOrientation } from '../orientation';
import { distance } from '../geometry';
import {
  activeBallCarrier,
  activeDefenseInitial,
  activeOffense,
  getActiveDefenderIds,
} from '../players';
import { effectiveDefensePositions, extractDefenderPositions, getDefenseHoop, getMatchupsAt } from '../engine';
import { optimalAssignment } from './matchupZone';
import type { DefenderTarget } from './types';
import {
  TRANSITION_BALL_CUSHION_PX,
  TRANSITION_BEHIND_BALL_PENALTY_PX,
  TRANSITION_MATCH_SAG,
  TRANSITION_RIM_DEPTH_PX,
} from './constants';

export type TransitionRole = 'stop-ball' | 'protect-rim' | 'match';

export interface TransitionPlan {
  matchups: Matchups;
  roles: Record<DefenderId, TransitionRole>;
  targets: Record<DefenderId, Point>;
}

/**
 * Répartition du repli. `startPos` = où sont les défenseurs au début de
 * l'étape ; `baseMatchups` = duels d'origine (départage à coût égal).
 */
export function planTransitionDefense(params: {
  off: AttackerPositions;
  ballCarrier: AttackerId;
  hoop: Point;
  defenderIds: DefenderId[];
  startPos: DefenderPositions;
  baseMatchups: Matchups;
  defenseDistance: number;
}): TransitionPlan {
  const { off, ballCarrier, hoop, defenderIds, startPos, baseMatchups, defenseDistance } = params;
  const up = Math.sign(MIDLINE_Y - hoop.y) || 1;
  const ballPos = off[ballCarrier];
  const matchups = {} as Matchups;
  const roles = {} as Record<DefenderId, TransitionRole>;
  const targets = {} as Record<DefenderId, Point>;
  const free = [...defenderIds].sort();
  const posOf = (d: DefenderId) => startPos[d] ?? hoop;
  // Derrière le ballon = plus loin du panier que le porteur : doit le
  // contourner pour se replacer devant.
  const behindBall = (p: Point) => !!ballPos && distance(p, hoop) > distance(ballPos, hoop);

  // 1. Arrêter le ballon.
  if (ballPos && free.length) {
    const toHoop = distance(ballPos, hoop) || 1;
    const cushion = Math.min(TRANSITION_BALL_CUSHION_PX, toHoop * 0.5);
    const stopPoint = {
      x: ballPos.x + ((hoop.x - ballPos.x) / toHoop) * cushion,
      y: ballPos.y + ((hoop.y - ballPos.y) / toHoop) * cushion,
    };
    const cost = (d: DefenderId) =>
      distance(posOf(d), stopPoint) + (behindBall(posOf(d)) ? TRANSITION_BEHIND_BALL_PENALTY_PX : 0);
    const stopper = free.reduce((best, d) => (cost(d) < cost(best) ? d : best));
    free.splice(free.indexOf(stopper), 1);
    matchups[stopper] = ballCarrier;
    roles[stopper] = 'stop-ball';
    targets[stopper] = stopPoint;
  }

  // 2. Protéger le panier.
  const rimPoint = { x: hoop.x, y: hoop.y + up * TRANSITION_RIM_DEPTH_PX };
  let rimDef: DefenderId | null = null;
  if (free.length) {
    rimDef = free.reduce((best, d) => (distance(posOf(d), rimPoint) < distance(posOf(best), rimPoint) ? d : best));
    free.splice(free.indexOf(rimDef), 1);
    roles[rimDef] = 'protect-rim';
    targets[rimDef] = rimPoint;
  }

  // 3. Premier attaquant disponible, les plus dangereux d'abord.
  const others = (Object.keys(off) as AttackerId[])
    .filter((o) => o !== ballCarrier)
    .sort((a, b) => distance(off[a], hoop) - distance(off[b], hoop));
  const toCover = others.slice(0, free.length);
  const left = others.slice(free.length);
  const guardPoint = (o: AttackerId): Point => {
    const man = manTarget(off[o], defenseDistance, hoop) ?? off[o];
    // En repli on reste entre son homme et le cercle, un peu affaissé.
    return {
      x: man.x + (rimPoint.x - man.x) * TRANSITION_MATCH_SAG,
      y: man.y + (rimPoint.y - man.y) * TRANSITION_MATCH_SAG,
    };
  };
  const assigned = optimalAssignment(free, toCover.sort(), (d, o) =>
    distance(posOf(d), guardPoint(o)) - (baseMatchups[d] === o ? 1 : 0));
  (Object.keys(assigned) as DefenderId[]).forEach((d) => {
    const o = assigned[d];
    matchups[d] = o;
    roles[d] = 'match';
    targets[d] = guardPoint(o);
  });

  // Le défenseur du cercle est nominalement sur l'attaquant laissé (trailer),
  // sinon sur l'attaquant le plus proche du cercle.
  if (rimDef) matchups[rimDef] = left[0] ?? others[0] ?? ballCarrier;

  return { matchups, roles, targets };
}

export function computeTransitionDefenseTargets(
  state: AppState,
  stepIdx: number
): { positions: Record<DefenderId, DefenderTarget>; matchupsApplied: Matchups } {
  const step = state.steps[stepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const ballCarrier = activeBallCarrier(step, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);
  const startPos: DefenderPositions = stepIdx > 0
    ? extractDefenderPositions(effectiveDefensePositions(state, stepIdx - 1))
    : activeDefenseInitial(state.defenseInitial, state.playerCount);
  const plan = planTransitionDefense({
    off,
    ballCarrier,
    hoop,
    defenderIds,
    startPos,
    baseMatchups: getMatchupsAt(state.steps, stepIdx - 1, state.playerCount),
    defenseDistance: state.defenseDistance,
  });

  const ballPos = off[ballCarrier];
  const positions = {} as Record<DefenderId, DefenderTarget>;
  defenderIds.forEach((dId) => {
    const target = plan.targets[dId] ?? startPos[dId] ?? hoop;
    const oId = plan.matchups[dId];
    const isCarrierDefender = oId === ballCarrier && plan.roles[dId] === 'stop-ball';
    const orient = computeDefenderOrientation({
      defenderPos: target,
      manPos: off[oId] ?? target,
      ballPos: ballPos ?? target,
      isCarrierDefender,
      stance: 'sag',
      manualDelta: state.rules[dId]?.orientation ?? 0,
      manualBody: state.rules[dId]?.bodyOrientation,
      bodyMode: state.rules[dId]?.bodyOrientationMode,
      gazeLock: state.rules[dId]?.gazeLock,
    });
    positions[dId] = {
      x: target.x,
      y: target.y,
      helpFactor: plan.roles[dId] === 'protect-rim' ? 1 : 0,
      isCarrierDefender,
      matchedTo: oId,
      onScreen: false,
      switchedThisStep: false,
      transitionRole: plan.roles[dId],
      orientation: orient.bodyOrientation,
      gazeOrientation: orient.gazeOrientation,
      facing: orient.facing,
      armBallSide: orient.armBallSide,
      armManSide: orient.armManSide,
    };
  });
  return { positions, matchupsApplied: plan.matchups };
}
