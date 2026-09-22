import type { AppState } from '../types';
import type { PlaybackFrame } from './playback/frameResolver';
import { getDefenseHoop, detectStepScreenAction } from './engine';
import { computeMetrics } from './metrics';
import { bestOffensiveAction, evaluateOffensiveOptions } from './offense';
import { computeCoachDiagnostics } from './coachDiagnostics';
import { detectScreenAction } from './screenAction';

/** Read-only analysis of the exact image emitted by useCourtFrame. */
export function computeFrameCoachAnalysis(state: AppState, frame: PlaybackFrame, dynamic: boolean) {
  const hoop = getDefenseHoop(state, frame.attackingTeam);
  const metrics = computeMetrics(frame.off, frame.defPos, frame.carrier, hoop);
  if (frame.ballInFlight) {
    metrics.openPasses = metrics.contestedPasses = metrics.blockedPasses = 0;
  }
  const bestAction = frame.ballInFlight ? null : bestOffensiveAction(evaluateOffensiveOptions(
    frame.off, frame.defPos, frame.carrier, hoop, state.attackerProfiles));
  const diagnostics = computeCoachDiagnostics(state, frame.stepIdx, dynamic ? frame : undefined);
  const screenAction = dynamic
    ? (frame.screen ? detectScreenAction(frame.off, null, frame.screen, null, null, hoop) : null)
    : detectStepScreenAction(state, frame.stepIdx)?.action ?? null;
  return { metrics, bestAction, diagnostics, screenAction };
}
