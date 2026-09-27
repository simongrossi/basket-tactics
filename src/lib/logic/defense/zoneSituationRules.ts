// Règles de placement par situation pour les zones 2-3 et 1-3-1 (la 3-2 a
// les siennes dans zone32Rotation.ts). Appliquées après le moteur de zone
// générique (ownership continu) quand le ballon est au coin, au poste haut
// ou à l'aile ; ballon au sommet → moteur générique inchangé.
//
// Pur ; les collisions sont résolues en aval (effectiveDefensePositions).

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  Point,
  ZoneLayout,
  ZoneRegion,
  ZoneType,
} from '../../types';
import { MIDLINE_Y } from '../../data/court';
import { carrierDefenderTarget } from '../manDefense';
import type { DefenderTarget } from './types';
import { applyZone32Rotation, createZonePlacer, zone32Situation, type Zone32Situation } from './zone32Rotation';
import {
  ZONE23_BALL_ELBOW_DEPTH_PX,
  ZONE23_BALL_ELBOW_LATERAL_PX,
  ZONE23_CORNER_COVER_DEPTH_PX,
  ZONE23_CORNER_COVER_LATERAL_PX,
  ZONE23_DIG_DEPTH_PX,
  ZONE23_DIG_LATERAL_PX,
  ZONE23_PIVOT_BLOCK_DEPTH_PX,
  ZONE23_PIVOT_BLOCK_LATERAL_PX,
  ZONE23_WEAK_GUARD_DEPTH_PX,
  ZONE23_WEAK_GUARD_LATERAL_PX,
  ZONE131_ANCHOR_WING_DEPTH_PX,
  ZONE131_ANCHOR_WING_LATERAL_PX,
  ZONE131_FRONT_POST_DEPTH_PX,
  ZONE131_FRONT_POST_LATERAL_PX,
  ZONE131_TRAP_DEPTH_PX,
  ZONE131_TRAP_LATERAL_PX,
  ZONE131_WEAK_MID_CORNER_DEPTH_PX,
  ZONE131_WEAK_MID_CORNER_LATERAL_PX,
  ZONE131_WEAK_MID_WING_DEPTH_PX,
  ZONE131_WEAK_MID_WING_LATERAL_PX,
  ZONE32_ELBOW_DEPTH_PX,
  ZONE32_ELBOW_LATERAL_PX,
  ZONE32_RIM_FRONT_DEPTH_PX,
  ZONE32_WEAK_LOW_DEPTH_PX,
  ZONE32_WEAK_LOW_LATERAL_PX,
} from './constants';

interface RuleParams {
  positions: Record<DefenderId, DefenderTarget>;
  layout: ZoneLayout;
  off: AttackerPositions;
  ballCarrier: AttackerId;
  hoop: Point;
  defenseDistance: number;
}

/** Régions « côté ballon » / « côté faible » d'une paire gauche / droite. */
function sides(layout: ZoneLayout, hoop: Point, side: number, leftId: string, rightId: string) {
  const left = layout.find((z) => z.id === leftId);
  const right = layout.find((z) => z.id === rightId);
  if (!left || !right) return null;
  const leftIsBall = Math.sign(left.homePos.x - hoop.x) === side;
  return leftIsBall ? { ball: left, weak: right } : { ball: right, weak: left };
}

function moved(...regions: ZoneRegion[]): DefenderId[] {
  return regions.map((r) => r.assignedTo);
}

/**
 * Zone 2-3 (gardes gauche / droite, ailes basses gauche / droite, pivot).
 *  - Coin : l'aile basse côté ballon sort, le pivot glisse au bloc côté
 *    ballon, l'aile basse opposée descend devant le cercle, le garde côté
 *    ballon descend au coude (ferme le poste haut et la passe au bloc), le
 *    garde opposé s'enfonce au milieu.
 *  - Poste haut : le pivot monte au contact face au panier, les deux ailes
 *    basses ferment les blocs, les gardes mettent la pression dans le dos.
 *  - Aile : le garde côté ballon sort, l'aile basse côté ballon couvre le
 *    coin, le pivot au bloc côté ballon, l'aile basse opposée au milieu de la
 *    raquette, le garde opposé vers la ligne des lancers.
 */
function applyZone23(params: RuleParams, situation: Zone32Situation): DefenderId[] {
  const { layout, off, ballCarrier, hoop, defenseDistance } = params;
  const ballPos = off[ballCarrier];
  const side = Math.sign(ballPos.x - hoop.x) || 1;
  const lows = sides(layout, hoop, side, 'wing-left', 'wing-right');
  const guards = sides(layout, hoop, side, 'guard-left', 'guard-right');
  const pivot = layout.find((z) => z.id === 'pivot');
  if (!lows || !guards || !pivot) return [];
  const { at, place } = createZonePlacer(params);
  const closeout = carrierDefenderTarget('contester', ballPos, defenseDistance, hoop) ?? ballPos;

  if (situation === 'corner') {
    place(lows.ball.assignedTo, closeout, false);
    place(pivot.assignedTo, at(side * ZONE23_PIVOT_BLOCK_LATERAL_PX, ZONE23_PIVOT_BLOCK_DEPTH_PX), true);
    place(lows.weak.assignedTo, at(side * 12, ZONE32_RIM_FRONT_DEPTH_PX), true);
    place(guards.ball.assignedTo, at(side * ZONE23_BALL_ELBOW_LATERAL_PX, ZONE23_BALL_ELBOW_DEPTH_PX), true);
    place(guards.weak.assignedTo, at(-side * ZONE23_WEAK_GUARD_LATERAL_PX, ZONE23_WEAK_GUARD_DEPTH_PX), true);
  } else if (situation === 'high-post') {
    place(pivot.assignedTo, closeout, false);
    const depth = Math.abs(ballPos.y - hoop.y);
    place(lows.ball.assignedTo, at(side * ZONE23_PIVOT_BLOCK_LATERAL_PX, ZONE23_PIVOT_BLOCK_DEPTH_PX), true);
    place(lows.weak.assignedTo, at(-side * ZONE23_PIVOT_BLOCK_LATERAL_PX, ZONE23_PIVOT_BLOCK_DEPTH_PX), true);
    const lateral = ballPos.x - hoop.x;
    place(guards.ball.assignedTo, at(lateral + side * ZONE23_DIG_LATERAL_PX, depth + ZONE23_DIG_DEPTH_PX), true);
    place(guards.weak.assignedTo, at(lateral - side * ZONE23_DIG_LATERAL_PX, depth + ZONE23_DIG_DEPTH_PX), true);
  } else {
    place(guards.ball.assignedTo, closeout, false);
    place(lows.ball.assignedTo, at(side * ZONE23_CORNER_COVER_LATERAL_PX, ZONE23_CORNER_COVER_DEPTH_PX), true);
    place(pivot.assignedTo, at(side * ZONE23_PIVOT_BLOCK_LATERAL_PX, ZONE23_PIVOT_BLOCK_DEPTH_PX), true);
    place(lows.weak.assignedTo, at(-side * ZONE32_WEAK_LOW_LATERAL_PX, ZONE32_WEAK_LOW_DEPTH_PX), true);
    place(guards.weak.assignedTo, at(-side * ZONE23_WEAK_GUARD_LATERAL_PX, ZONE23_WEAK_GUARD_DEPTH_PX), true);
  }
  return moved(lows.ball, lows.weak, guards.ball, guards.weak, pivot);
}

/**
 * Zone 1-3-1 (pointe, trois au milieu, défenseur de la ligne de fond).
 *  - Coin : le défenseur de la ligne de fond sort au coin, l'aile côté
 *    ballon ferme la passe au poste bas, le milieu descend devant le cercle,
 *    l'aile opposée au bloc faible, la pointe au coude côté ballon.
 *  - Aile : piège léger — l'aile côté ballon sort, la pointe vient fermer
 *    côté milieu ; le milieu ferme le poste haut, le défenseur de la ligne de
 *    fond couvre le bloc et le coin côté ballon, l'aile opposée s'enfonce.
 */
function applyZone131(params: RuleParams, situation: Zone32Situation): DefenderId[] {
  const { layout, off, ballCarrier, hoop, defenseDistance } = params;
  if (situation === 'high-post') return [];
  const ballPos = off[ballCarrier];
  const side = Math.sign(ballPos.x - hoop.x) || 1;
  const up = Math.sign(MIDLINE_Y - hoop.y) || 1;
  const mids = sides(layout, hoop, side, 'mid-left', 'mid-right');
  const center = layout.find((z) => z.id === 'mid-center');
  const anchor = layout.find((z) => z.id === 'anchor');
  const chaser = layout.find((z) => z.id === 'chaser');
  if (!mids || !center || !anchor || !chaser) return [];
  const { at, place } = createZonePlacer(params);
  const closeout = carrierDefenderTarget('contester', ballPos, defenseDistance, hoop) ?? ballPos;

  if (situation === 'corner') {
    place(anchor.assignedTo, closeout, false);
    place(mids.ball.assignedTo, at(side * ZONE131_FRONT_POST_LATERAL_PX, ZONE131_FRONT_POST_DEPTH_PX), true);
    place(center.assignedTo, at(side * 20, ZONE32_RIM_FRONT_DEPTH_PX + 20), true);
    place(mids.weak.assignedTo, at(-side * ZONE131_WEAK_MID_CORNER_LATERAL_PX, ZONE131_WEAK_MID_CORNER_DEPTH_PX), true);
    place(chaser.assignedTo, at(side * ZONE32_ELBOW_LATERAL_PX, ZONE32_ELBOW_DEPTH_PX), true);
  } else {
    // Piège léger : l'aile sort sur le porteur, la pointe ferme côté milieu
    // (vers l'axe et vers la mi-terrain), sans monter au contact.
    place(mids.ball.assignedTo, closeout, false);
    const trap = { x: ballPos.x - side * ZONE131_TRAP_LATERAL_PX, y: ballPos.y + up * ZONE131_TRAP_DEPTH_PX };
    place(chaser.assignedTo, trap, false);
    place(center.assignedTo, at(side * 30, 175), true);
    place(anchor.assignedTo, at(side * ZONE131_ANCHOR_WING_LATERAL_PX, ZONE131_ANCHOR_WING_DEPTH_PX), true);
    place(mids.weak.assignedTo, at(-side * ZONE131_WEAK_MID_WING_LATERAL_PX, ZONE131_WEAK_MID_WING_DEPTH_PX), true);
  }
  return moved(mids.ball, mids.weak, center, anchor, chaser);
}

/**
 * Applique la règle de la zone selon la situation du ballon. Retourne les
 * défenseurs repositionnés (orientation à recalculer par l'appelant).
 */
export function applyZoneSituationRules(params: RuleParams & {
  type: ZoneType;
  cornerRotation?: 'baseline' | 'wing';
}): DefenderId[] {
  const { type, off, ballCarrier, hoop } = params;
  if (type === 'zone-3-2') return applyZone32Rotation(params).moved;
  const ballPos = off[ballCarrier];
  if (!ballPos) return [];
  const situation = zone32Situation(ballPos, hoop);
  if (!situation) return [];
  if (type === 'zone-2-3') return applyZone23(params, situation);
  if (type === 'zone-1-3-1') return applyZone131(params, situation);
  return [];
}
