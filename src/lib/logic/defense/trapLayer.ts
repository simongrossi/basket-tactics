// Couche 4 — Trap auto.
//
// Si le porteur est dans une zone de trappe (coin fond, sideline) et que le
// trigger trap est actif, un défenseur tiers vient verrouiller le côté
// opposé pour fermer la cage.
//
// **Trap v3 — coexistence avec écran porteur** :
//   - Avant v3, le trap était SKIPPÉ si un écran était détecté. C'était trop
//     conservateur : un écran posé DANS une zone de trap est typiquement
//     LE moment où la défense veut trapper (le porteur est à la fois piégé
//     par la zone + ralenti par l'écran).
//   - v3 : le trap coexiste avec l'écran SAUF dans 2 cas spéciaux :
//       * `screenRule === 'blitz'` : le blitz est lui-même un trap PnR, pas
//         de double trap nécessaire.
//       * `screenRule === 'switch'` : matchups déjà swappés, le porteur
//         n'a plus le mismatch initial, le trap perd son sens immédiat.
//   - Le helper picker exclut maintenant le `screenerDef` (déjà engagé sur
//     l'écran) pour éviter de l'attirer hors de sa couverture.

import type { AttackerId, DefenderId, Matchups } from '../../types';
import { isInTrapZone, pickTrapHelper, trapTarget } from '../trap';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyTrapLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const {
    state, off, ballCarrier, carrierPos, hoop, prevDefenderPositions,
    screen, effectiveScreenRule,
  } = ctx;
  if (!state.triggers.trap) return;
  if (!isInTrapZone(carrierPos, hoop)) return;

  // v3 — Coexistence avec un écran porteur :
  //  - 'blitz' : la rule est déjà un trap, on laisse `applyScreenAdjustment`
  //    gérer (deux trappeurs créés là-bas).
  //  - 'switch' : le porteur est défendu par un nouveau homme, le concept
  //    de trap zonal perd son immédiateté.
  if (screen && (effectiveScreenRule === 'blitz' || effectiveScreenRule === 'switch')) {
    return;
  }

  const carrierDef = (Object.entries(matchups) as [DefenderId, AttackerId][])
    .find(([, o]) => o === ballCarrier)?.[0];
  if (!carrierDef) return;

  // v3 — Exclure le screenerDef si un écran est en cours : il est déjà
  // engagé sur l'écran (drop / hedge / etc.), l'attirer en trap casserait
  // la couverture.
  const exclude = screen ? new Set<DefenderId>([screen.screenerDef]) : undefined;

  const helper = pickTrapHelper(off, prevDefenderPositions, matchups, ballCarrier, exclude);
  if (!helper) return;
  const t = trapTarget(carrierPos, { x: positions[carrierDef].x, y: positions[carrierDef].y });
  positions[helper].x = Math.round(t.x);
  positions[helper].y = Math.round(t.y);
}
