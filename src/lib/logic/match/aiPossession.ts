import type {
  Annotation,
  AppState,
  AttackerId,
  AttackerPositions,
  Point,
  Step,
} from '@/lib/types';
import { COURT, FULL_COURT_INNER_MAX_Y, HOOP } from '@/lib/data/court';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import { effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import {
  evaluateOffensiveOptions,
  type OffensiveAction,
} from '@/lib/logic/offense';
import { breakUpTeleports } from '@/lib/logic/breakUpTeleports';
import { ensureAnnotationsForMovement } from '@/lib/logic/migrateAnnotations';

export type AiPossessionOutcome =
  | 'shot-made'
  | 'shot-missed'
  | 'turnover-pass'
  | 'turnover-drive'
  | 'forced-shot-made'
  | 'forced-shot-missed'
  | 'empty';

export type AiPossessionEventType =
  | 'pass'
  | 'drive'
  | 'shot'
  | 'turnover'
  | 'forced-shot';

export interface AiPossessionEvent {
  possession: number;
  clock: number;
  actor: AttackerId;
  type: AiPossessionEventType;
  label: string;
  targetId?: AttackerId;
  expectedPoints?: number;
  successRate?: number;
  scoreProbability?: number;
  points?: number;
  /** B3a — métadonnées de tir enrichies, présentes uniquement sur les
   *  événements `'shot'` ou `'forced-shot'`. Permet aux consommateurs
   *  (HUD live, replay, analyse stats) de détailler le tir sans devoir
   *  recompute.
   */
  shotZone?: 'rim' | 'paint' | 'mid' | 'three' | 'deep';
  /** Distance (px) du défenseur le plus proche au moment du tir. */
  contestDistance?: number;
  /** True si le tir est considéré contesté (défenseur ≤ `CONTEST_THRESHOLD_PX`). */
  contested?: boolean;
  /** Position du tir final pour rejeu / heatmap. */
  shotPos?: Point;
  /** Valeur du tir tenté (2 ou 3 points), indépendamment du fait qu'il
   *  soit réussi ou pas (= shotPoints de OffensiveAction). */
  shotPointsAttempted?: 2 | 3;
}

export interface AiPossessionPlan {
  possession: number;
  seed: number;
  steps: Step[];
  generatedStartIndex: number;
  events: AiPossessionEvent[];
  outcome: AiPossessionOutcome;
  points: number;
}

export interface AiMatchSeriesSummary {
  possessions: number;
  totalPoints: number;
  ppp: number;
  made: number;
  missed: number;
  turnovers: number;
}

export interface AiMatchSeries {
  seed: number;
  plans: AiPossessionPlan[];
  summary: AiMatchSeriesSummary;
}

export interface GenerateAiMatchOptions {
  possessions?: number;
  seed?: number;
  maxActionsPerPossession?: number;
  creativity?: number;
}

const DEFAULT_POSSESSIONS = 3;
const DEFAULT_MAX_ACTIONS = 6;
const DEFAULT_CREATIVITY = 0.35;
const DECISION_SECONDS = 2.2;
const LOW_CLOCK_SECONDS = 4.5;
const GENERATED_STEP_MAX_PX = 80;
const AI_GENERATED_BY = 'ai-match';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function seededAiRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneStep(step: Step): Step {
  return structuredClone(step);
}

function cloneOff(off: AttackerPositions): AttackerPositions {
  return structuredClone(off);
}

function clampToCourt(p: Point, state: AppState): Point {
  const maxY =
    state.fullCourt || state.attackingDirection === 'down'
      ? FULL_COURT_INNER_MAX_Y
      : COURT.innerMaxY;
  return {
    x: clamp(p.x, COURT.marginX, COURT.innerMaxX),
    y: clamp(p.y, COURT.marginY, maxY),
  };
}

function actionTemperature(creativity: number): number {
  return 0.12 + clamp(creativity, 0, 1) * 0.32;
}

function pickAction(actions: OffensiveAction[], rng: () => number, creativity: number): OffensiveAction {
  if (actions.length <= 1 || creativity <= 0) return actions[0];
  const temperature = actionTemperature(creativity);
  const weights = actions.map((a) => Math.exp(a.expectedPoints / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < actions.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return actions[i];
  }
  return actions[0];
}

function appendAnnotationToLast(steps: Step[], annotation: Annotation): void {
  const idx = steps.length - 1;
  const last = steps[idx];
  steps[idx] = {
    ...last,
    annotations: [...(last.annotations ?? []), annotation],
  };
}

function buildWorkingState(base: AppState, steps: Step[]): AppState {
  return {
    ...base,
    steps,
    activeStep: steps.length - 1,
  };
}

function scoreOutcome(action: OffensiveAction, rng: () => number, forced: boolean): {
  outcome: AiPossessionOutcome;
  points: number;
} {
  const made = rng() < action.scoreProbability;
  if (made) {
    return { outcome: forced ? 'forced-shot-made' : 'shot-made', points: action.shotPoints };
  }
  return { outcome: forced ? 'forced-shot-missed' : 'shot-missed', points: 0 };
}

function pushTerminalShotStep(
  steps: Step[],
  possession: number,
  actor: AttackerId,
  action: OffensiveAction,
  points: number,
  forced: boolean,
): void {
  const current = steps[steps.length - 1];
  const made = points > 0;
  const prefix = forced ? 'tir forcé' : 'tir';
  steps.push({
    ...cloneStep(current),
    annotations: [],
    label: `IA P${possession} · ${prefix} ${actor} ${made ? `+${points}` : 'raté'}`,
    generatedBy: AI_GENERATED_BY,
  });
}

function finishWithShot(
  steps: Step[],
  events: AiPossessionEvent[],
  possession: number,
  clock: number,
  actor: AttackerId,
  action: OffensiveAction,
  rng: () => number,
  forced: boolean,
): { outcome: AiPossessionOutcome; points: number } {
  const result = scoreOutcome(action, rng, forced);
  pushTerminalShotStep(steps, possession, actor, action, result.points, forced);
  events.push({
    possession,
    clock: round2(clock),
    actor,
    type: forced ? 'forced-shot' : 'shot',
    label: `${forced ? 'Tir forcé' : 'Tir'} ${actor} (${Math.round(action.scoreProbability * 100)}%)`,
    expectedPoints: round2(action.expectedPoints),
    scoreProbability: round2(action.scoreProbability),
    points: result.points,
  });
  return result;
}

function smoothGeneratedSegment(state: AppState, rawSteps: Step[], startIndex: number): Step[] {
  const untouchedPrefix = rawSteps.slice(0, startIndex).map(cloneStep);
  const generatedSegment = rawSteps.slice(startIndex).map(cloneStep);
  const smoothed = ensureAnnotationsForMovement(
    breakUpTeleports(generatedSegment, GENERATED_STEP_MAX_PX),
    state.playerCount,
  );
  return [...untouchedPrefix, ...smoothed];
}

export function generateAiPossessionPlan(
  state: AppState,
  options: GenerateAiMatchOptions = {},
  possession = 1,
): AiPossessionPlan {
  const sourceStep = state.steps[state.activeStep];
  const seed = options.seed ?? Date.now();
  if (!sourceStep) {
    return {
      possession,
      seed,
      steps: state.steps.map(cloneStep),
      generatedStartIndex: state.activeStep,
      events: [],
      outcome: 'empty',
      points: 0,
    };
  }

  const rng = seededAiRng(seed);
  const maxActions = Math.max(1, options.maxActionsPerPossession ?? DEFAULT_MAX_ACTIONS);
  const creativity = options.creativity ?? DEFAULT_CREATIVITY;
  const hoop = getDefenseHoop(state);
  const shotClock = state.possessionSeconds ?? 24;
  const generatedStartIndex = state.activeStep;
  const steps = state.steps.slice(0, generatedStartIndex + 1).map(cloneStep);
  steps[generatedStartIndex] = {
    ...steps[generatedStartIndex],
    label: steps[generatedStartIndex].label ?? `IA P${possession} · départ`,
  };

  const events: AiPossessionEvent[] = [];
  let clock = shotClock;
  let outcome: AiPossessionOutcome = 'empty';
  let points = 0;

  for (let actionIdx = 0; actionIdx < maxActions; actionIdx += 1) {
    const current = steps[steps.length - 1];
    const off = activeOffense(current.off, state.playerCount);
    const carrier = activeBallCarrier(current, state.playerCount);
    const workingState = buildWorkingState(state, steps);
    const defPos = effectiveDefensePositions(workingState, workingState.activeStep);
    const actions = evaluateOffensiveOptions(
      off,
      defPos,
      carrier,
      hoop,
      state.attackerProfiles,
    );
    if (actions.length === 0) break;

    if (clock <= LOW_CLOCK_SECONDS) {
      const forcedShot = actions.find((a) => a.type === 'shoot') ?? actions[0];
      const result = finishWithShot(
        steps,
        events,
        possession,
        clock,
        carrier,
        forcedShot,
        rng,
        true,
      );
      outcome = result.outcome;
      points = result.points;
      break;
    }

    const chosen = pickAction(actions, rng, creativity);
    clock = Math.max(0, clock - DECISION_SECONDS);

    if (chosen.type === 'shoot') {
      const result = finishWithShot(
        steps,
        events,
        possession,
        clock,
        carrier,
        chosen,
        rng,
        false,
      );
      outcome = result.outcome;
      points = result.points;
      break;
    }

    if (chosen.type === 'drive') {
      const carrierPos = off[carrier];
      const driveTarget = clampToCourt(chosen.shotPos, state);
      appendAnnotationToLast(steps, {
        type: 'dribble',
        fromId: carrier,
        from: { ...carrierPos },
        to: { ...driveTarget },
      });

      const nextOff = cloneOff(current.off);
      nextOff[carrier] = driveTarget;
      const driveLost = rng() > chosen.successRate;
      steps.push({
        off: nextOff,
        ballCarrier: carrier,
        annotations: [],
        label: `IA P${possession} · drive ${carrier}${driveLost ? ' stoppé' : ''}`,
        generatedBy: AI_GENERATED_BY,
      });
      events.push({
        possession,
        clock: round2(clock),
        actor: carrier,
        type: driveLost ? 'turnover' : 'drive',
        label: driveLost ? `Drive perdu ${carrier}` : `Drive ${carrier} vers cercle`,
        expectedPoints: round2(chosen.expectedPoints),
        successRate: round2(chosen.successRate),
        scoreProbability: round2(chosen.scoreProbability),
      });

      if (driveLost) {
        outcome = 'turnover-drive';
        points = 0;
        break;
      }

      const result = finishWithShot(
        steps,
        events,
        possession,
        clock,
        carrier,
        chosen,
        rng,
        false,
      );
      outcome = result.outcome;
      points = result.points;
      break;
    }

    const targetId = chosen.targetId;
    if (!targetId) continue;
    const carrierPos = off[carrier];
    const targetPos = off[targetId];
    appendAnnotationToLast(steps, {
      type: 'pass',
      fromId: carrier,
      toId: targetId,
      from: { ...carrierPos },
      to: { ...targetPos },
    });

    const passLost = rng() > chosen.successRate;
    steps.push({
      off: cloneOff(current.off),
      ballCarrier: passLost ? carrier : targetId,
      annotations: [],
      label: passLost
        ? `IA P${possession} · passe ${carrier}→${targetId} perdue`
        : `IA P${possession} · passe ${carrier}→${targetId}`,
      generatedBy: AI_GENERATED_BY,
    });
    events.push({
      possession,
      clock: round2(clock),
      actor: carrier,
      targetId,
      type: passLost ? 'turnover' : 'pass',
      label: passLost ? `Passe perdue ${carrier}→${targetId}` : `Passe ${carrier}→${targetId}`,
      expectedPoints: round2(chosen.expectedPoints),
      successRate: round2(chosen.successRate),
      scoreProbability: round2(chosen.scoreProbability),
    });

    if (passLost) {
      outcome = 'turnover-pass';
      points = 0;
      break;
    }
  }

  if (outcome === 'empty') {
    const current = steps[steps.length - 1];
    const off = activeOffense(current.off, state.playerCount);
    const carrier = activeBallCarrier(current, state.playerCount);
    const workingState = buildWorkingState(state, steps);
    const defPos = effectiveDefensePositions(workingState, workingState.activeStep);
    const actions = evaluateOffensiveOptions(off, defPos, carrier, hoop || HOOP, state.attackerProfiles);
    const forcedShot = actions.find((a) => a.type === 'shoot') ?? actions[0];
    if (forcedShot) {
      const result = finishWithShot(
        steps,
        events,
        possession,
        clock,
        carrier,
        forcedShot,
        rng,
        true,
      );
      outcome = result.outcome;
      points = result.points;
    }
  }

  return {
    possession,
    seed,
    steps: smoothGeneratedSegment(state, steps, generatedStartIndex),
    generatedStartIndex,
    events,
    outcome,
    points,
  };
}

export function generateAiMatchSeries(
  state: AppState,
  options: GenerateAiMatchOptions = {},
): AiMatchSeries {
  const possessions = clamp(
    Math.round(options.possessions ?? DEFAULT_POSSESSIONS),
    1,
    8,
  );
  const seed = options.seed ?? Date.now();
  const plans: AiPossessionPlan[] = [];

  for (let i = 0; i < possessions; i += 1) {
    plans.push(
      generateAiPossessionPlan(
        state,
        {
          ...options,
          seed: seed + i * 7919,
        },
        i + 1,
      ),
    );
  }

  const totalPoints = plans.reduce((sum, plan) => sum + plan.points, 0);
  const made = plans.filter((plan) => plan.outcome.endsWith('made')).length;
  const missed = plans.filter((plan) => plan.outcome.endsWith('missed')).length;
  const turnovers = plans.filter((plan) => plan.outcome.startsWith('turnover')).length;

  return {
    seed,
    plans,
    summary: {
      possessions,
      totalPoints,
      ppp: totalPoints / Math.max(1, possessions),
      made,
      missed,
      turnovers,
    },
  };
}
