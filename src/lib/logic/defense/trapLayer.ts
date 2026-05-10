// Couche 4 — Trap auto : si le porteur est dans une zone de trappe et que
// le trigger trap est actif (sans écran porteur en cours), le défenseur le
// plus proche (hors carrierDef) vient verrouiller le côté opposé pour
// fermer la cage.

import type { AttackerId, DefenderId, Matchups } from '../../types';
import { isInTrapZone, pickTrapHelper, trapTarget } from '../trap';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyTrapLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { state, off, ballCarrier, carrierPos, hoop, prevDefenderPositions, screen } = ctx;
  if (!state.triggers.trap || screen !== null || !isInTrapZone(carrierPos, hoop)) return;

  const carrierDef = (Object.entries(matchups) as [DefenderId, AttackerId][])
    .find(([, o]) => o === ballCarrier)?.[0];
  if (!carrierDef) return;
  const helper = pickTrapHelper(off, prevDefenderPositions, matchups, ballCarrier);
  if (!helper) return;
  const t = trapTarget(carrierPos, { x: positions[carrierDef].x, y: positions[carrierDef].y });
  positions[helper].x = Math.round(t.x);
  positions[helper].y = Math.round(t.y);
}
