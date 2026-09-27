// Zone 3-2 — règles de placement par situation (coin, poste haut, aile).
//
// Le moteur de zone générique (ownership continu) fait courir l'aile au coin.
// La règle enseignée en 3-2 (1-2-2) est différente :
//  - le défenseur du bas côté ballon sort sur le coin ;
//  - l'aile côté ballon redescend au poste bas qu'il vient de quitter ;
//  - le bas côté faible glisse devant le cercle ;
//  - le haut (pointe) descend au coude côté ballon (ferme le poste haut) ;
//  - l'aile côté faible s'enfonce vers la ligne des lancers (passe à
//    l'opposé et poste haut).
//
// Réglage `zoneConfig.cornerRotation` : `baseline` (défaut, règle ci-dessus)
// ou `wing` (l'aile sort au coin, comportement du moteur générique).
// Pur ; les collisions sont résolues en aval (effectiveDefensePositions).

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  Point,
  ZoneLayout,
} from '../../types';
import { MIDLINE_Y } from '../../data/court';
import { carrierDefenderTarget } from '../manDefense';
import { distance } from '../geometry';
import type { DefenderTarget } from './types';
import {
  ZONE32_CORNER_LATERAL_PX,
  ZONE32_CORNER_DEPTH_PX,
  ZONE32_ELBOW_LATERAL_PX,
  ZONE32_ELBOW_DEPTH_PX,
  ZONE32_RIM_FRONT_DEPTH_PX,
  ZONE32_WEAK_WING_LATERAL_PX,
  ZONE32_WEAK_WING_DEPTH_PX,
  ZONE32_PICKUP_RADIUS_PX,
  ZONE32_HIGH_POST_LATERAL_PX,
  ZONE32_HIGH_POST_MIN_DEPTH_PX,
  ZONE32_HIGH_POST_MAX_DEPTH_PX,
  ZONE32_WING_LATERAL_PX,
  ZONE32_WING_MAX_DEPTH_PX,
  ZONE32_DIG_OFFSET_PX,
  ZONE32_PINCH_LATERAL_PX,
  ZONE32_GAP_LATERAL_PX,
  ZONE32_GAP_DEPTH_PX,
  ZONE32_WEAK_LOW_LATERAL_PX,
  ZONE32_WEAK_LOW_DEPTH_PX,
} from './constants';

/** Vrai si le porteur est dans un coin (près de la ligne de fond, hors raquette). */
export function isCornerBall(ballPos: Point, hoop: Point): boolean {
  return Math.abs(ballPos.x - hoop.x) >= ZONE32_CORNER_LATERAL_PX &&
    Math.abs(ballPos.y - hoop.y) <= ZONE32_CORNER_DEPTH_PX;
}

/** Attaquant le plus proche d'un point, dans un rayon, pas encore pris. */
function nearestAttacker(off: AttackerPositions, p: Point, taken: Set<AttackerId>): AttackerId | null {
  let best: AttackerId | null = null;
  let bestD = ZONE32_PICKUP_RADIUS_PX;
  (Object.entries(off) as [AttackerId, Point][]).forEach(([id, pos]) => {
    if (taken.has(id)) return;
    const d = distance(pos, p);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  });
  return best;
}

/** Situation de la 3-2 reconnue d'après la position du porteur. */
export type Zone32Situation = 'corner' | 'high-post' | 'wing';

/** Porteur au poste haut : dans l'axe, entre ~3 et ~6 m du panier. */
export function isHighPostBall(ballPos: Point, hoop: Point): boolean {
  const depth = Math.abs(ballPos.y - hoop.y);
  return Math.abs(ballPos.x - hoop.x) <= ZONE32_HIGH_POST_LATERAL_PX &&
    depth >= ZONE32_HIGH_POST_MIN_DEPTH_PX && depth <= ZONE32_HIGH_POST_MAX_DEPTH_PX;
}

/** Porteur à l'aile : excentré, ni au coin ni au sommet. */
export function isWingBall(ballPos: Point, hoop: Point): boolean {
  return !isCornerBall(ballPos, hoop) &&
    Math.abs(ballPos.x - hoop.x) >= ZONE32_WING_LATERAL_PX &&
    Math.abs(ballPos.y - hoop.y) <= ZONE32_WING_MAX_DEPTH_PX;
}

export function zone32Situation(ballPos: Point, hoop: Point): Zone32Situation | null {
  if (isCornerBall(ballPos, hoop)) return 'corner';
  if (isHighPostBall(ballPos, hoop)) return 'high-post';
  if (isWingBall(ballPos, hoop)) return 'wing';
  return null;
}

/**
 * Applique la règle de la 3-2 selon la situation du ballon. Mute `positions`
 * (x, y, matchedTo, isCarrierDefender) des 5 rôles ; ne fait rien si le
 * ballon est au sommet, si la règle est désactivée pour le coin, ou si un
 * rôle manque (moins de 5 défenseurs, layout modifié). Retourne la situation
 * et les défenseurs repositionnés (orientation à recalculer).
 *
 *  - Coin (`cornerRotation` ≠ 'wing') : le bas côté ballon sort, l'aile
 *    redescend au poste bas, le bas faible devant le cercle, la pointe au
 *    coude côté ballon, l'aile faible vers la ligne des lancers.
 *  - Poste haut : on « pince » le poste haut. Le bas libre (personne à son
 *    bloc) monte au contact face au panier, la pointe met la pression dans
 *    le dos, les ailes resserrent vers les coudes, l'autre bas garde le
 *    joueur à son poste bas (sinon tient le cercle).
 *  - Aile (et renversement, rôles en miroir) : l'aile côté ballon sort, la
 *    pointe ferme l'intervalle côté ballon (pénétration axe / poste haut), le
 *    bas côté ballon tient le poste bas, le bas faible au milieu de la
 *    raquette, l'aile faible vers la ligne des lancers (passe à l'opposé).
 */
export function applyZone32Rotation(params: {
  positions: Record<DefenderId, DefenderTarget>;
  layout: ZoneLayout;
  off: AttackerPositions;
  ballCarrier: AttackerId;
  hoop: Point;
  defenseDistance: number;
  cornerRotation?: 'baseline' | 'wing';
}): { situation: Zone32Situation | null; moved: DefenderId[] } {
  const { positions, layout, off, ballCarrier, hoop, defenseDistance } = params;
  const none = { situation: null, moved: [] as DefenderId[] };
  const ballPos = off[ballCarrier];
  if (!ballPos) return none;
  const situation = zone32Situation(ballPos, hoop);
  if (!situation) return none;
  if (situation === 'corner' && params.cornerRotation === 'wing') return none;

  // Poste haut dans l'axe : le « côté ballon » est celui où penche le porteur.
  const side = Math.sign(ballPos.x - hoop.x) || 1;
  const up = Math.sign(MIDLINE_Y - hoop.y) || 1;
  const region = (id: string) => layout.find((z) => z.id === id);
  const onBallSide = (id: string) => Math.sign((region(id)?.homePos.x ?? hoop.x) - hoop.x) === side;
  const ballLow = onBallSide('low-left') ? region('low-left') : region('low-right');
  const weakLow = onBallSide('low-left') ? region('low-right') : region('low-left');
  const ballWing = onBallSide('top-left') ? region('top-left') : region('top-right');
  const weakWing = onBallSide('top-left') ? region('top-right') : region('top-left');
  const top = region('top-center');
  if (!ballLow || !weakLow || !ballWing || !weakWing || !top) return none;
  if (ballLow === weakLow || ballWing === weakWing) return none;

  const at = (lateral: number, depth: number): Point => ({ x: hoop.x + lateral, y: hoop.y + up * depth });
  // Chaque attaquant n'est rattaché qu'une fois ; sans voisin, le défenseur
  // est une aide pure (rattaché au porteur, qu'il regarde, sans le marquer).
  const taken = new Set<AttackerId>([ballCarrier]);
  const place = (dId: DefenderId, p: Point, pickup: boolean) => {
    const t = positions[dId];
    if (!t) return;
    t.x = p.x;
    t.y = p.y;
    const matched = pickup ? nearestAttacker(off, p, taken) : ballCarrier;
    if (matched) taken.add(matched);
    t.matchedTo = matched ?? ballCarrier;
    t.isCarrierDefender = !pickup;
  };
  const closeout = carrierDefenderTarget('contester', ballPos, defenseDistance, hoop) ?? ballPos;

  if (situation === 'corner') {
    place(ballLow.assignedTo, closeout, false);
    place(ballWing.assignedTo, ballLow.homePos, true);
    place(weakLow.assignedTo, at(side * 12, ZONE32_RIM_FRONT_DEPTH_PX), true);
    place(top.assignedTo, at(side * ZONE32_ELBOW_LATERAL_PX, ZONE32_ELBOW_DEPTH_PX), true);
    place(weakWing.assignedTo, at(-side * ZONE32_WEAK_WING_LATERAL_PX, ZONE32_WEAK_WING_DEPTH_PX), true);
  } else if (situation === 'high-post') {
    // Monte au contact le bas qui n'a personne près de son bloc (sinon le
    // plus proche du porteur) ; l'autre garde son poste bas ou le cercle.
    const postUp = (z: typeof top) => nearestAttacker(off, z.homePos, new Set([ballCarrier])) !== null;
    const ballLowBusy = postUp(ballLow);
    const weakLowBusy = postUp(weakLow);
    const stepUp = ballLowBusy !== weakLowBusy
      ? (ballLowBusy ? weakLow : ballLow)
      : (distance(ballLow.homePos, ballPos) <= distance(weakLow.homePos, ballPos) ? ballLow : weakLow);
    const stayHome = stepUp === ballLow ? weakLow : ballLow;
    place(stepUp.assignedTo, closeout, false);
    const ballDepth = Math.abs(ballPos.y - hoop.y);
    // La pointe met la pression dans le dos du poste haut.
    place(top.assignedTo, at(ballPos.x - hoop.x, ballDepth + ZONE32_DIG_OFFSET_PX), true);
    // Les ailes resserrent vers les coudes, à mi-chemin de leur place.
    const pinch = (wing: typeof top, lateral: number) => {
      const elbow = at(lateral, ballDepth);
      place(wing.assignedTo, { x: (wing.homePos.x + elbow.x) / 2, y: (wing.homePos.y + elbow.y) / 2 }, true);
    };
    pinch(ballWing, side * ZONE32_PINCH_LATERAL_PX);
    pinch(weakWing, -side * ZONE32_PINCH_LATERAL_PX);
    // L'autre bas garde le joueur à son poste bas, sinon tient le cercle.
    place(stayHome.assignedTo, postUp(stayHome) ? stayHome.homePos : at(0, ZONE32_RIM_FRONT_DEPTH_PX), true);
  } else {
    place(ballWing.assignedTo, closeout, false);
    place(top.assignedTo, at(side * ZONE32_GAP_LATERAL_PX, ZONE32_GAP_DEPTH_PX), true);
    place(ballLow.assignedTo, ballLow.homePos, true);
    place(weakLow.assignedTo, at(-side * ZONE32_WEAK_LOW_LATERAL_PX, ZONE32_WEAK_LOW_DEPTH_PX), true);
    place(weakWing.assignedTo, at(-side * ZONE32_WEAK_WING_LATERAL_PX, ZONE32_WEAK_WING_DEPTH_PX), true);
  }

  return {
    situation,
    moved: [ballLow.assignedTo, ballWing.assignedTo, weakLow.assignedTo, top.assignedTo, weakWing.assignedTo],
  };
}
