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
import { computeDefenseTargets, effectiveDefensePositions, extractDefenderPositions, getDefenseHoop, getMatchupsAt } from '../engine';
import { optimalAssignment } from './matchupZone';
import type { DefenderTarget } from './types';
import { swapsFromMatchups, type RotationSwap } from './rotationMemory';
import {
  TRANSITION_BALL_CUSHION_PX,
  TRANSITION_BEHIND_BALL_PENALTY_PX,
  TRANSITION_MATCH_SAG,
  TRANSITION_RIM_DEPTH_PX,
  TRANSITION_BACK_MARGIN_PX,
  TRANSITION_INPLAY_MARGIN_PX,
  TRANSITION_FEINT_RIM_RATIO,
  TRANSITION_FEINT_MAX_RIM_DIST_PX,
  TRANSITION_FEINT_SHADE,
  TRANSITION_TANDEM_WING_LATERAL_PX,
} from './constants';

/** Rôles du repli :
 *  - `stop-ball` : arrête le ballon ;
 *  - `protect-rim` : protège le panier ;
 *  - `match` : premier attaquant disponible / retardataire ;
 *  - `feint-retreat` : 2 contre 1, feinte sur le porteur et recule au cercle ;
 *  - `tandem-drop` : tandem, le défenseur du haut descend au cercle après la
 *    passe à l'aile (« on tourne »). */
export type TransitionRole = 'stop-ball' | 'protect-rim' | 'match' | 'feint-retreat' | 'tandem-drop';

/** Défenseurs revenus devant le ballon et attaquants dans le jeu. */
export function transitionNumbers(params: {
  off: AttackerPositions;
  ballCarrier: AttackerId;
  hoop: Point;
  defenderIds: DefenderId[];
  startPos: DefenderPositions;
}): { back: DefenderId[]; inPlay: AttackerId[] } {
  const { off, ballCarrier, hoop, defenderIds, startPos } = params;
  const ballPos = off[ballCarrier];
  if (!ballPos) return { back: [], inPlay: [] };
  const ballDist = distance(ballPos, hoop);
  const back = defenderIds.filter((d) => {
    const p = startPos[d];
    return !!p && distance(p, hoop) < ballDist - TRANSITION_BACK_MARGIN_PX;
  });
  const inPlay = (Object.keys(off) as AttackerId[]).filter((o) =>
    o === ballCarrier || distance(off[o], hoop) <= ballDist + TRANSITION_INPLAY_MARGIN_PX);
  return { back, inPlay };
}

/** La défense est-elle en infériorité numérique devant le ballon ? */
export function defenseOutnumbered(params: Parameters<typeof transitionNumbers>[0]): boolean {
  const { back, inPlay } = transitionNumbers(params);
  return back.length < inPlay.length;
}

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

  // Infériorité numérique avec 1 ou 2 défenseurs revenus : règles 2c1 /
  // tandem + retardataires.
  const { back, inPlay } = transitionNumbers({ off, ballCarrier, hoop, defenderIds, startPos });
  if (ballPos && (back.length === 1 || back.length === 2) && back.length < inPlay.length) {
    return planOutnumbered({
      off, ballCarrier, hoop, up, back, inPlay, late: free.filter((d) => !back.includes(d)),
      posOf, defenseDistance,
    });
  }

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
): { positions: Record<DefenderId, DefenderTarget>; matchupsApplied: Matchups; rotationSwaps?: RotationSwap[]; transitionPhase: true } {
  const step = state.steps[stepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const ballCarrier = activeBallCarrier(step, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);
  const startPos: DefenderPositions = stepIdx > 0
    ? extractDefenderPositions(effectiveDefensePositions(state, stepIdx - 1))
    : activeDefenseInitial(state.defenseInitial, state.playerCount);
  const baseMatchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
  const plan = planTransitionDefense({
    off,
    ballCarrier,
    hoop,
    defenderIds,
    startPos,
    baseMatchups,
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
  // Phase 2 — les duels du repli sont exprimés en échanges par rapport aux
  // duels d'origine : l'étape suivante les reporte et ils se défont au
  // retour au calme (cf. carryRotationSwaps).
  const swaps = swapsFromMatchups(baseMatchups, plan.matchups, stepIdx);
  return {
    positions,
    matchupsApplied: plan.matchups,
    rotationSwaps: swaps.length ? swaps : undefined,
    transitionPhase: true,
  };
}

/** Point d'arrêt du ballon : `cushion` px devant le porteur, côté panier. */
function stopPointFor(ballPos: Point, hoop: Point): Point {
  const toHoop = distance(ballPos, hoop) || 1;
  const cushion = Math.min(TRANSITION_BALL_CUSHION_PX, toHoop * 0.5);
  return {
    x: ballPos.x + ((hoop.x - ballPos.x) / toHoop) * cushion,
    y: ballPos.y + ((hoop.y - ballPos.y) / toHoop) * cushion,
  };
}

/**
 * Infériorité numérique (1 ou 2 défenseurs revenus devant le ballon) :
 *  - 2 contre 1 : le défenseur ne choisit pas trop tôt — il recule devant le
 *    cercle (à mi-chemin du ballon), décalé vers l'autre attaquant ;
 *  - tandem (2 revenus) : ballon dans l'axe → le haut arrête le ballon, le
 *    bas garde le cercle ; ballon à l'aile / au coin → le bas sort sur la
 *    passe, le haut descend au cercle (« on tourne ») ;
 *  - retardataires : le premier revenu prend l'attaquant libre le plus
 *    dangereux (le plus près du panier), puis le suivant, etc.
 */
function planOutnumbered(params: {
  off: AttackerPositions;
  ballCarrier: AttackerId;
  hoop: Point;
  up: number;
  back: DefenderId[];
  inPlay: AttackerId[];
  late: DefenderId[];
  posOf: (d: DefenderId) => Point;
  defenseDistance: number;
}): TransitionPlan {
  const { off, ballCarrier, hoop, up, back, inPlay, late, posOf, defenseDistance } = params;
  const ballPos = off[ballCarrier];
  const matchups = {} as Matchups;
  const roles = {} as Record<DefenderId, TransitionRole>;
  const targets = {} as Record<DefenderId, Point>;
  const rimPoint = { x: hoop.x, y: hoop.y + up * TRANSITION_RIM_DEPTH_PX };
  const byDanger = (ids: AttackerId[]) => [...ids].sort((a, b) => distance(off[a], hoop) - distance(off[b], hoop));
  const [bottom, top] = [...back].sort((a, b) => distance(posOf(a), hoop) - distance(posOf(b), hoop));
  // Défenseurs « de zone » (cercle / recul) : rattachés plus bas à l'attaquant
  // le plus dangereux laissé libre par les retardataires.
  const zoners: DefenderId[] = [];

  if (!top) {
    // 2 contre 1 : feinte puis recul devant le cercle, sans choisir.
    const toBall = distance(ballPos, hoop) || 1;
    const depth = Math.min(toBall * TRANSITION_FEINT_RIM_RATIO, TRANSITION_FEINT_MAX_RIM_DIST_PX);
    const base = {
      x: hoop.x + ((ballPos.x - hoop.x) / toBall) * depth,
      y: hoop.y + ((ballPos.y - hoop.y) / toBall) * depth,
    };
    const others = inPlay.filter((o) => o !== ballCarrier);
    const centroid = others.length
      ? { x: others.reduce((s, o) => s + off[o].x, 0) / others.length, y: others.reduce((s, o) => s + off[o].y, 0) / others.length }
      : base;
    targets[bottom] = {
      x: base.x + (centroid.x - base.x) * TRANSITION_FEINT_SHADE,
      y: base.y + (centroid.y - base.y) * TRANSITION_FEINT_SHADE,
    };
    roles[bottom] = 'feint-retreat';
    matchups[bottom] = ballCarrier;
  } else {
    const wingBall = Math.abs(ballPos.x - hoop.x) >= TRANSITION_TANDEM_WING_LATERAL_PX;
    // Axe : le haut arrête le ballon, le bas garde le cercle. Aile : on tourne.
    const onBall = wingBall ? bottom : top;
    const toRim = wingBall ? top : bottom;
    targets[onBall] = stopPointFor(ballPos, hoop);
    roles[onBall] = 'stop-ball';
    matchups[onBall] = ballCarrier;
    targets[toRim] = rimPoint;
    roles[toRim] = wingBall ? 'tandem-drop' : 'protect-rim';
    zoners.push(toRim);
  }

  // Retardataires : le premier revenu prend l'attaquant libre le plus dangereux.
  const free = byDanger((Object.keys(off) as AttackerId[]).filter((o) => o !== ballCarrier));
  const lateOrder = [...late].sort((a, b) => distance(posOf(a), hoop) - distance(posOf(b), hoop));
  for (const d of lateOrder) {
    const o = free.shift();
    if (!o) {
      zoners.push(d);
      targets[d] = rimPoint;
      roles[d] = 'protect-rim';
      continue;
    }
    const man = manTarget(off[o], defenseDistance, hoop) ?? off[o];
    targets[d] = {
      x: man.x + (rimPoint.x - man.x) * TRANSITION_MATCH_SAG,
      y: man.y + (rimPoint.y - man.y) * TRANSITION_MATCH_SAG,
    };
    roles[d] = 'match';
    matchups[d] = o;
  }
  // Défenseurs de zone : nominalement sur l'attaquant le plus dangereux
  // encore libre (sinon le porteur).
  for (const d of zoners) matchups[d] = free.shift() ?? ballCarrier;
  // 2 contre 1 : si des attaquants restent libres, le défenseur qui recule
  // reste nominalement sur le porteur (il ne choisit pas).
  return { matchups, roles, targets };
}

/**
 * La transition se poursuit à l'étape `stepIdx` si l'étape précédente était
 * jouée en repli et que la défense reste en infériorité numérique devant le
 * ballon (positions réelles de l'étape précédente). Dès que les nombres
 * s'égalisent, le moteur normal reprend et les duels du repli se rendent
 * par paires (carryTransitionSwaps).
 */
export function continuesTransition(state: AppState, stepIdx: number): boolean {
  if (stepIdx <= 0) return false;
  // Coût nul sur les systèmes sans fast-break : aucune étape de repli avant.
  if (!state.steps.slice(0, stepIdx).some((s) => s.transitionDefense)) return false;
  if (!computeDefenseTargets(state, stepIdx - 1).transitionPhase) return false;
  const step = state.steps[stepIdx];
  return defenseOutnumbered({
    off: activeOffense(step.off, state.playerCount),
    ballCarrier: activeBallCarrier(step, state.playerCount),
    hoop: getDefenseHoop(state),
    defenderIds: getActiveDefenderIds(state.playerCount),
    startPos: extractDefenderPositions(effectiveDefensePositions(state, stepIdx - 1)),
  });
}
