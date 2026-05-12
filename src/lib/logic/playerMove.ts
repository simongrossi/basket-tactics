import type { AppState, AttackerId, DefenderId, Point } from '@/lib/types';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import { setPlayerPositionAt } from './stepMutations';

function samePoint(a: Point | undefined, b: Point): boolean {
  return !!a && a.x === b.x && a.y === b.y;
}

function markStepAsManual(state: AppState, stepIdx: number): AppState {
  if (stepIdx <= 0) return state;
  const cur = state.steps[stepIdx];
  if (!cur || !cur.generatedBy || cur.manualOverride) return state;
  const steps = [...state.steps];
  steps[stepIdx] = { ...cur, manualOverride: true };
  return { ...state, steps };
}

export function moveAttackerInState(
  state: AppState,
  id: AttackerId,
  point: Point
): AppState {
  const step = state.steps[state.activeStep];
  if (!step || !step.off[id]) return state;
  if (samePoint(step.off[id], point)) return state;

  const steps = setPlayerPositionAt(state.steps, state.activeStep, id, point);
  const next = { ...state, steps };
  return markStepAsManual(next, state.activeStep);
}

export function moveDefenderInState(
  state: AppState,
  id: DefenderId,
  point: Point
): AppState {
  const step = state.steps[state.activeStep];
  if (!step) return state;

  if (state.defenseSystem === 'zone' && state.zoneEditMode) {
    const baseLayout = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
    const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(baseLayout) : baseLayout;
    const region = oriented.find((r) => r.assignedTo === id);
    if (!region) return state;

    const nextPoint = { x: Math.round(point.x), y: Math.round(point.y) };
    const current = state.zoneOverrides?.[region.id]?.homePos ?? region.homePos;
    if (samePoint(current, nextPoint)) return state;

    const curOverride = state.zoneOverrides?.[region.id] ?? {};
    return {
      ...state,
      zoneOverrides: {
        ...(state.zoneOverrides ?? {}),
        [region.id]: { ...curOverride, homePos: nextPoint },
      },
    };
  }

  const currentOverride = step.defenseOverrides?.[id];
  if (samePoint(currentOverride, point)) return state;
  if (!currentOverride && state.activeStep === 0 && samePoint(state.defenseInitial[id], point)) {
    return state;
  }

  const steps = [...state.steps];
  const cur = { ...step };
  cur.defenseOverrides = { ...cur.defenseOverrides, [id]: point };
  steps[state.activeStep] = cur;
  const defenseInitial =
    state.activeStep === 0 ? { ...state.defenseInitial, [id]: point } : state.defenseInitial;
  return { ...state, steps, defenseInitial };
}
