import type {
  AppState,
  AttackerId,
  AttackerPositions,
  OffensiveScriptedAction,
  ScriptedActionParams,
  ScriptedActionType,
} from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { compileScenario } from './compileScenario';
import {
  detectFlicker,
  flattenDefPos,
  type FrameSnapshot,
} from './anomaly/anomalyDetector';
import type { AnomalyReport } from './anomaly/types';
import {
  collectPlaybackJumpDiagnostics,
  type PlaybackJumpDiagnostic,
} from './playbackDiagnostics';
import { effectiveDefensePositions } from './engine';

export interface MovementSimulationFinding {
  actionTypes: ScriptedActionType[];
  kind: 'step-flicker' | 'playback-jump';
  playerId: string;
  stepIdx: number;
  message: string;
  value: number;
}

export interface MovementSimulationOptions {
  initialOff?: AttackerPositions;
  initialBallCarrier?: AttackerId;
  fps?: number;
  maxJumpPx?: number;
  includeDefenders?: boolean;
}

export const DEFAULT_SIMULATION_OFF: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

export function buildSimulationActions(
  actionTypes: ScriptedActionType[],
  defaultParams: Partial<Record<ScriptedActionType, ScriptedActionParams>>,
): OffensiveScriptedAction[] {
  return actionTypes.map((type, idx) => ({
    kind: 'offensive',
    id: `sim-${idx}-${type}`,
    type,
    params: defaultParams[type] ?? {},
  }));
}

export function auditScriptedActions(
  actionTypes: ScriptedActionType[],
  defaultParams: Partial<Record<ScriptedActionType, ScriptedActionParams>>,
  options: MovementSimulationOptions = {},
): { state: AppState; findings: MovementSimulationFinding[] } {
  const initialOff = options.initialOff ?? DEFAULT_SIMULATION_OFF;
  const initialBallCarrier = options.initialBallCarrier ?? 'O1';
  const actions = buildSimulationActions(actionTypes, defaultParams);
  const steps = compileScenario({
    initialOff,
    initialBallCarrier,
    actions,
  });
  const state: AppState = {
    ...makeInitialState(),
    steps,
    activeStep: 0,
  };

  const findings: MovementSimulationFinding[] = [
    ...stepFlickerFindings(state, actionTypes, options.includeDefenders ?? false),
    ...playbackJumpFindings(state, actionTypes, options),
  ];
  return { state, findings };
}

export function auditScriptedActionPairs(
  actionTypes: ScriptedActionType[],
  defaultParams: Partial<Record<ScriptedActionType, ScriptedActionParams>>,
  options: MovementSimulationOptions = {},
): MovementSimulationFinding[] {
  const findings: MovementSimulationFinding[] = [];
  actionTypes.forEach((a) => {
    actionTypes.forEach((b) => {
      findings.push(...auditScriptedActions([a, b], defaultParams, options).findings);
    });
  });
  return findings;
}

function stepFlickerFindings(
  state: AppState,
  actionTypes: ScriptedActionType[],
  includeDefenders: boolean,
): MovementSimulationFinding[] {
  const snapshots = state.steps.map((step, stepIdx): FrameSnapshot => ({
    stepIdx,
    off: step.off,
    defPos: flattenDefPos(effectiveDefensePositions(state, stepIdx)),
  }));

  const reports: AnomalyReport[] = [];
  for (let i = 2; i < snapshots.length; i++) {
    reports.push(...detectFlicker(snapshots[i - 2], snapshots[i - 1], snapshots[i]));
  }

  return reports
    .filter((report) => includeDefenders || report.playerId.startsWith('O'))
    .map((report) => ({
      actionTypes,
      kind: 'step-flicker',
      playerId: report.playerId,
      stepIdx: report.stepIdx,
      message: report.message,
      value: report.value,
    }));
}

function playbackJumpFindings(
  state: AppState,
  actionTypes: ScriptedActionType[],
  options: MovementSimulationOptions,
): MovementSimulationFinding[] {
  const jumps: PlaybackJumpDiagnostic[] = collectPlaybackJumpDiagnostics(state, {
    fps: options.fps ?? 60,
    maxJumpPx: options.maxJumpPx ?? 20,
    collectDecisions: true,
  });

  return jumps
    .filter((jump) => options.includeDefenders || jump.kind === 'attacker')
    .map((jump) => ({
      actionTypes,
      kind: 'playback-jump',
      playerId: jump.player,
      stepIdx: Number(jump.tStep.split('→')[0]),
      message: `${jump.player} saute de ${jump.jump.toFixed(1)} px frame ${jump.frame} (${jump.tStep})`,
      value: jump.jump,
    }));
}

export function formatMovementSimulationFindings(
  findings: MovementSimulationFinding[],
  maxRows: number = 20,
): string {
  return findings
    .slice(0, maxRows)
    .map((finding) =>
      `${finding.actionTypes.join(' → ')} | ${finding.kind} | ${finding.playerId} step ${finding.stepIdx} | ${finding.message}`,
    )
    .join('\n');
}
