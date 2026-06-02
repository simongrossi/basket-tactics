// #8.1 — Détection de la relâche d'un blitz (le ballon ressort du trap).
//
// Conditions :
//  1. stepIdx >= 1
//  2. Au step N-1, un écran porteur était détecté avec effectiveScreenRule blitz
//  3. Le ballCarrier a changé entre N-1 et N (ballon sorti)
//
// Lit le contexte du step N-1 via buildDefenseFrameContext (comme
// detectRejectedScreen). Pur (pas de mutation d'état).

import type { AppState, AttackerId, DefenderId } from '../../types';
import { activeBallCarrier } from '../players';
import { buildDefenseFrameContext } from './context';

export interface BlitzRelease {
  carrierDefId: DefenderId;
  screenerDefId: DefenderId;
  rollerId: AttackerId;
  formerCarrierId: AttackerId;
}

export function detectBlitzRelease(state: AppState, stepIdx: number): BlitzRelease | null {
  if (stepIdx < 1) return null;

  const prevStep = state.steps[stepIdx - 1];
  const curStep = state.steps[stepIdx];
  if (!prevStep || !curStep) return null;

  const prevCarrier = activeBallCarrier(prevStep, state.playerCount);
  const curCarrier = activeBallCarrier(curStep, state.playerCount);
  if (prevCarrier === curCarrier) return null; // ballon pas ressorti

  const { ctx } = buildDefenseFrameContext(state, stepIdx - 1);
  if (!ctx.screen || ctx.effectiveScreenRule !== 'blitz') return null;

  return {
    carrierDefId: ctx.screen.carrierDef,
    screenerDefId: ctx.screen.screenerDef,
    rollerId: ctx.screen.screener,
    formerCarrierId: prevCarrier,
  };
}
