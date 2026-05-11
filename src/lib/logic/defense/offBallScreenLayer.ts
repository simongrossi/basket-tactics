// Couche 3 — Écrans hors-ballon : détection + application de la règle
// (switch / over / under / chase). Mute `matchups` en cas de switch.

import type { DefenderId, Matchups } from '../../types';
import {
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
  detectOffBallScreens,
} from '../screens';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyOffBallScreenLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { state, off, ballCarrier, prevDefenderPositions, prevOff, carrierPos } = ctx;
  const prevOffAtStep = prevOff ?? undefined;
  const offBallScreens = detectOffBallScreens(
    off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, prevOffAtStep
  );
  for (const obs of offBallScreens) {
    if (state.offBallScreenRule === 'switch') {
      const newMatchups = applySwitchOffBall(matchups, obs);
      // Mute matchups en place pour que les couches suivantes voient le switch.
      matchups[obs.cutterDef] = newMatchups[obs.cutterDef];
      matchups[obs.screenerDef] = newMatchups[obs.screenerDef];
      positions[obs.cutterDef].matchedTo = matchups[obs.cutterDef];
      positions[obs.screenerDef].matchedTo = matchups[obs.screenerDef];
    } else {
      const cutterTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.cutterDef].x, y: positions[obs.cutterDef].y },
        obs, state.offBallScreenRule, obs.cutterDef, off, carrierPos
      );
      positions[obs.cutterDef].x = Math.round(cutterTarget.x);
      positions[obs.cutterDef].y = Math.round(cutterTarget.y);

      const screenerTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.screenerDef].x, y: positions[obs.screenerDef].y },
        obs, state.offBallScreenRule, obs.screenerDef, off, carrierPos
      );
      positions[obs.screenerDef].x = Math.round(screenerTarget.x);
      positions[obs.screenerDef].y = Math.round(screenerTarget.y);
    }
    positions[obs.cutterDef].onScreen = true;
    if (state.offBallScreenRule !== 'switch') {
      positions[obs.cutterDef].screenPhase = 'impact';
    }
    positions[obs.screenerDef].onScreen = true;
  }
}
