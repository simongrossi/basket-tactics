// Zone 3-2 — règle de rotation sur ballon au coin.
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

/**
 * Applique la rotation de coin de la 3-2. Mute `positions` (x, y, matchedTo,
 * isCarrierDefender) des 5 rôles ; ne fait rien si le ballon n'est pas au
 * coin ou si un rôle manque (moins de 5 défenseurs, layout modifié).
 * Retourne la liste des défenseurs repositionnés (orientation à recalculer).
 */
export function applyZone32CornerRotation(params: {
  positions: Record<DefenderId, DefenderTarget>;
  layout: ZoneLayout;
  off: AttackerPositions;
  ballCarrier: AttackerId;
  hoop: Point;
  defenseDistance: number;
}): DefenderId[] {
  const { positions, layout, off, ballCarrier, hoop, defenseDistance } = params;
  const ballPos = off[ballCarrier];
  if (!ballPos || !isCornerBall(ballPos, hoop)) return [];

  const side = Math.sign(ballPos.x - hoop.x);
  const up = Math.sign(MIDLINE_Y - hoop.y) || 1;
  const region = (id: string) => layout.find((z) => z.id === id);
  const onBallSide = (id: string) => Math.sign((region(id)?.homePos.x ?? hoop.x) - hoop.x) === side;
  const ballLow = onBallSide('low-left') ? region('low-left') : region('low-right');
  const weakLow = onBallSide('low-left') ? region('low-right') : region('low-left');
  const ballWing = onBallSide('top-left') ? region('top-left') : region('top-right');
  const weakWing = onBallSide('top-left') ? region('top-right') : region('top-left');
  const top = region('top-center');
  if (!ballLow || !weakLow || !ballWing || !weakWing || !top) return [];
  if (ballLow === weakLow || ballWing === weakWing) return [];

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

  // Le bas côté ballon sort sur le coin.
  const closeout = carrierDefenderTarget('contester', ballPos, defenseDistance, hoop) ?? ballPos;
  place(ballLow.assignedTo, closeout, false);
  // L'aile côté ballon redescend au poste bas.
  const block = ballLow.homePos;
  place(ballWing.assignedTo, block, true);
  // Le bas côté faible glisse devant le cercle.
  const rimFront = at(side * 12, ZONE32_RIM_FRONT_DEPTH_PX);
  place(weakLow.assignedTo, rimFront, true);
  // La pointe descend au coude côté ballon.
  const elbow = at(side * ZONE32_ELBOW_LATERAL_PX, ZONE32_ELBOW_DEPTH_PX);
  place(top.assignedTo, elbow, true);
  // L'aile côté faible s'enfonce vers la ligne des lancers.
  const weakSink = at(-side * ZONE32_WEAK_WING_LATERAL_PX, ZONE32_WEAK_WING_DEPTH_PX);
  place(weakWing.assignedTo, weakSink, true);

  return [ballLow.assignedTo, ballWing.assignedTo, weakLow.assignedTo, top.assignedTo, weakWing.assignedTo];
}
