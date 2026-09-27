// Zone matchup : un défenseur par attaquant, apparié selon la zone.
//
// Principe coach : « on se place en zone, on prend l'homme qui est dans sa
// zone, puis on défend en individuelle avec les principes de zone ». Donc :
//  1. Appariement : à l'étape 0, chaque défenseur prend l'attaquant le plus
//     proche de sa place de zone (affectation optimale, un pour un — jamais
//     deux défenseurs sur le même homme, jamais un attaquant oublié).
//  2. Continuité : ensuite, chacun garde son homme (et le défenseur du
//     porteur ne lâche jamais le ballon pour une coupe hors ballon)…
//  3. …sauf passage de relais : un coupeur qui quitte la zone de son
//     défenseur pour traverser la zone d'un coéquipier est « passé » ; le
//     défenseur libéré prend l'attaquant qui entre chez lui.
//  4. Placement : individuelle sur le porteur ; hors ballon, on voit le
//     ballon et le côté faible s'enfonce dans la raquette (principe de zone).
//
// Pur et déterministe. La mémoire de l'appariement est dérivée de l'étape
// précédente (récursion à index décroissant, arrêt à 0), comme la mémoire
// de rotation en défense individuelle.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  Matchups,
  Point,
  ZoneLayout,
} from '../../types';
import { applyZoneOverrides, getZoneLayout, mirrorZoneLayout } from '../../data/zones';
import { carrierDefenderTarget, manTarget } from '../manDefense';
import { computeDefenderOrientation } from '../orientation';
import { pointInPolygon } from '../zoneDefense';
import { isWeakSide, strictSide } from '../courtSides';
import { distance } from '../geometry';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';
import type { DefenderTarget } from './types';
import {
  MATCHUP_BALL_STICK_BONUS_PX,
  MATCHUP_OUT_OF_ZONE_PENALTY_PX,
  MATCHUP_STICK_BONUS_PX,
  MATCHUP_BALL_SIDE_SAG,
  MATCHUP_WEAK_SIDE_SAG,
  MATCHUP_HELP_LINE_RATIO,
} from './constants';

export interface MatchupZoneResult {
  positions: Record<DefenderId, DefenderTarget>;
  matchupsApplied: Matchups;
}

/** Layout de la zone matchup orienté selon le sens d'attaque, overrides
 *  coach appliqués, limité aux défenseurs actifs. */
function matchupLayout(state: AppState, defenderIds: DefenderId[]): ZoneLayout {
  const base = getZoneLayout('zone-matchup', state.zoneConfig.verticalOffset ?? 0);
  const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
  return applyZoneOverrides(oriented, state.zoneOverrides).filter((z) => defenderIds.includes(z.assignedTo));
}

/** Toutes les permutations de `items` (≤ 5 éléments → ≤ 120). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}

/**
 * Affectation un-pour-un de coût total minimal (défenseurs × attaquants).
 * Départage déterministe : ordre des permutations (ids triés).
 */
export function optimalAssignment(
  defenderIds: DefenderId[],
  attackerIds: AttackerId[],
  cost: (d: DefenderId, o: AttackerId) => number
): Matchups {
  const n = Math.min(defenderIds.length, attackerIds.length);
  const defs = defenderIds.slice(0, n);
  let best: AttackerId[] = attackerIds.slice(0, n);
  let bestCost = Infinity;
  for (const perm of permutations(attackerIds).map((p) => p.slice(0, n))) {
    let total = 0;
    for (let i = 0; i < n && total < bestCost; i++) total += cost(defs[i], perm[i]);
    if (total < bestCost - 1e-9) {
      bestCost = total;
      best = perm;
    }
  }
  const out = {} as Matchups;
  defs.forEach((d, i) => { out[d] = best[i]; });
  return out;
}

/**
 * Appariement de l'étape : à l'étape 0, par la place de zone ; ensuite en
 * gardant son homme, sauf passage de relais d'un coupeur qui a quitté la
 * zone de son défenseur.
 */
export function matchupAssignment(params: {
  layout: ZoneLayout;
  off: AttackerPositions;
  /** Appariement de l'étape précédente, absent à l'étape 0. */
  prevMatchups?: Matchups;
  /** Porteur à cette étape : son défenseur ne le lâche pas. */
  ballCarrier?: AttackerId;
}): Matchups {
  const { layout, off, prevMatchups, ballCarrier } = params;
  const defenderIds = layout.map((z) => z.assignedTo).sort();
  const attackerIds = (Object.keys(off) as AttackerId[]).sort();
  const regionOf = new Map(layout.map((z) => [z.assignedTo, z]));
  return optimalAssignment(defenderIds, attackerIds, (d, o) => {
    const att = off[o];
    if (!att) return Infinity;
    // Référence = la place de zone (fixe) : « je prends l'homme qui est dans
    // ma zone ». Stable d'une étape à l'autre, contrairement à la position
    // courante du défenseur qui suit son coupeur.
    const region = regionOf.get(d)!;
    let c = distance(region.homePos, att);
    const inMyZone = pointInPolygon(att, region.polygon);
    if (!inMyZone) c += MATCHUP_OUT_OF_ZONE_PENALTY_PX;
    // Continuité : on garde son homme tant qu'il reste dans sa zone. Un
    // coupeur sorti de la zone perd ce bonus → il peut être « passé ».
    if (prevMatchups && prevMatchups[d] === o && inMyZone) c -= MATCHUP_STICK_BONUS_PX;
    // On ne lâche pas le ballon, même quand le porteur change de zone.
    if (prevMatchups && prevMatchups[d] === o && o === ballCarrier) c -= MATCHUP_BALL_STICK_BONUS_PX;
    return c;
  });
}

/** Cible hors ballon : individuelle, avec affaissement vers la ligne d'aide
 *  (entre le panier et le ballon) — faible côté ballon, fort côté faible. */
function offBallTarget(att: Point, ballPos: Point, hoop: Point, defenseDistance: number): { target: Point; sag: number } {
  const man = manTarget(att, defenseDistance, hoop) ?? att;
  const weak = isWeakSide(strictSide(att.x, hoop.x), strictSide(ballPos.x, hoop.x));
  const sag = weak ? MATCHUP_WEAK_SIDE_SAG : MATCHUP_BALL_SIDE_SAG;
  const helpPoint = {
    x: hoop.x + (ballPos.x - hoop.x) * MATCHUP_HELP_LINE_RATIO,
    y: hoop.y + (ballPos.y - hoop.y) * MATCHUP_HELP_LINE_RATIO,
  };
  return {
    target: { x: man.x + (helpPoint.x - man.x) * sag, y: man.y + (helpPoint.y - man.y) * sag },
    sag,
  };
}

export function computeMatchupZoneTargets(state: AppState, stepIdx: number): MatchupZoneResult {
  const step = state.steps[stepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const ballCarrier = activeBallCarrier(step, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);
  const layout = matchupLayout(state, defenderIds);

  const prev = stepIdx > 0 ? computeMatchupZoneTargets(state, stepIdx - 1) : null;
  const defenderPos: Partial<Record<DefenderId, Point>> = {};
  layout.forEach((z) => {
    const p = prev?.positions[z.assignedTo];
    defenderPos[z.assignedTo] = p ? { x: p.x, y: p.y } : z.homePos;
  });
  const matchups = matchupAssignment({
    layout,
    off,
    prevMatchups: prev?.matchupsApplied,
    ballCarrier,
  });

  const ballPos = off[ballCarrier];
  const positions = {} as Record<DefenderId, DefenderTarget>;
  defenderIds.forEach((dId) => {
    const oId = matchups[dId];
    const att = oId ? off[oId] : undefined;
    const home = defenderPos[dId] ?? state.defenseInitial[dId];
    const isCarrierDefender = oId === ballCarrier;
    let target: Point = home;
    let helpFactor = 0;
    if (att && isCarrierDefender) {
      target = carrierDefenderTarget(
        state.rules[dId]?.vsCarrier ?? 'contester', att, state.defenseDistance, hoop,
        state.attackerHands?.[oId] ?? 'right',
      ) ?? att;
    } else if (att && ballPos) {
      const r = offBallTarget(att, ballPos, hoop, state.defenseDistance);
      target = r.target;
      helpFactor = r.sag;
    }
    const orient = computeDefenderOrientation({
      defenderPos: target,
      manPos: att ?? target,
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
      helpFactor,
      isCarrierDefender,
      matchedTo: oId,
      onScreen: false,
      // Passage de relais : l'homme a changé depuis l'étape précédente.
      switchedThisStep: !!prev && prev.matchupsApplied[dId] !== oId,
      orientation: orient.bodyOrientation,
      gazeOrientation: orient.gazeOrientation,
      facing: orient.facing,
      armBallSide: orient.armBallSide,
      armManSide: orient.armManSide,
    };
  });

  return { positions, matchupsApplied: matchups };
}
