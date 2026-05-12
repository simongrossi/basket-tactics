// Couche 3 — Écrans hors-ballon : détection + application de la règle
// (switch / over / under / chase). Mute `matchups` en cas de switch.

import type { AttackerId, DefenderId, Matchups, OffBallScreenRule } from '../../types';
import {
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
  cuttersInScreenChain,
  detectOffBallScreens,
} from '../screens';
import { offBallScreenQuality, offBallScreeners } from '../screenContext';
import { contactQualityForOffBallRule } from '../screenPhysics';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyOffBallScreenLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { state, stepIdx, off, ballCarrier, prevDefenderPositions, prevOff, carrierPos } = ctx;
  const prevOffAtStep = prevOff ?? undefined;
  const offBallScreens = detectOffBallScreens(
    off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, prevOffAtStep
  );

  // B9 — Chaîne d'écrans : si un cutter est dans son 2ᵉ écran consécutif
  // (ou plus), bascule `top-lock` → `chase` pour ce cutter. Calculé une
  // fois par couche, partagé entre les écrans détectés à ce step.
  const cutterChain = state.offBallScreenRule === 'top-lock'
    ? cuttersInScreenChain(
        state,
        stepIdx,
        offBallScreens.map((s) => s.cutter),
        3,
        2
      )
    : new Set<AttackerId>();

  for (const obs of offBallScreens) {
    // Rule effective par cutter — top-lock → chase si chaîne ≥ 2.
    const effectiveRule: OffBallScreenRule =
      state.offBallScreenRule === 'top-lock' && cutterChain.has(obs.cutter)
        ? 'chase'
        : state.offBallScreenRule;
    const rawQuality = offBallScreenQuality([ctx.step, state.steps[ctx.stepIdx - 1]], obs);
    const contactQuality = contactQualityForOffBallRule(
      rawQuality,
      effectiveRule,
      'arriving',
      obs.type
    );
    if (effectiveRule === 'switch') {
      const newMatchups = applySwitchOffBall(matchups, obs);
      // Mute matchups en place pour que les couches suivantes voient le switch.
      matchups[obs.cutterDef] = newMatchups[obs.cutterDef];
      matchups[obs.screenerDef] = newMatchups[obs.screenerDef];
      positions[obs.cutterDef].matchedTo = matchups[obs.cutterDef];
      positions[obs.screenerDef].matchedTo = matchups[obs.screenerDef];
    } else {
      const cutterTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.cutterDef].x, y: positions[obs.cutterDef].y },
        obs, effectiveRule, obs.cutterDef, off, carrierPos, contactQuality
      );
      positions[obs.cutterDef].x = Math.round(cutterTarget.x);
      positions[obs.cutterDef].y = Math.round(cutterTarget.y);

      const screenerTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.screenerDef].x, y: positions[obs.screenerDef].y },
        obs, effectiveRule, obs.screenerDef, off, carrierPos, contactQuality
      );
      positions[obs.screenerDef].x = Math.round(screenerTarget.x);
      positions[obs.screenerDef].y = Math.round(screenerTarget.y);

      if (obs.secondScreenerDef && positions[obs.secondScreenerDef]) {
        const secondScreenerTarget = applyOffBallScreenAdjustment(
          { x: positions[obs.secondScreenerDef].x, y: positions[obs.secondScreenerDef].y },
          obs,
          effectiveRule,
          obs.secondScreenerDef,
          off,
          carrierPos,
          contactQuality
        );
        positions[obs.secondScreenerDef].x = Math.round(secondScreenerTarget.x);
        positions[obs.secondScreenerDef].y = Math.round(secondScreenerTarget.y);
      }
    }
    positions[obs.cutterDef].onScreen = true;
    if (effectiveRule !== 'switch' && contactQuality >= 10) {
      positions[obs.cutterDef].screenPhase = 'impact';
    }
    offBallScreeners(obs).forEach((screenContact) => {
      if (positions[screenContact.screenerDef]) {
        positions[screenContact.screenerDef].onScreen = true;
      }
    });
  }
}
