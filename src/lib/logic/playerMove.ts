import type { AppState, AttackerId, DefenderId, Point } from '@/lib/types';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { pushOutOfMany } from './geometry';
import { activeOffense, getActiveAttackerIds, getActiveDefenderIds } from './players';
import { setPlayerPositionAt } from './stepMutations';

function samePoint(a: Point | undefined, b: Point): boolean {
  return !!a && a.x === b.x && a.y === b.y;
}

/** Repousse `point` hors de tous les autres joueurs ACTIFS (attaquants ≠
 *  movingId + défenseurs au step courant). Garantit visuellement que deux
 *  joueurs ne se superposent jamais (seuil = PLAYER_MIN_CLEARANCE_PX, soit
 *  ≈ 2 × rayon sprite + 2 px). Appelé pour TOUT déplacement utilisateur
 *  (drag d'attaquant ou de défenseur), pas seulement à la fin du drag. */
function pushOutOfOtherPlayers(
  state: AppState,
  movingKind: 'attacker' | 'defender',
  movingId: string,
  point: Point
): Point {
  const step = state.steps[state.activeStep];
  if (!step) return point;
  const offIds = getActiveAttackerIds(state.playerCount);
  const defIds = getActiveDefenderIds(state.playerCount);
  const off = activeOffense(step.off, state.playerCount);
  const obstacles: Point[] = [];
  // Autres attaquants (≠ movingId si on bouge un attaquant).
  offIds.forEach((oId) => {
    if (movingKind === 'attacker' && oId === movingId) return;
    const p = off[oId];
    if (p) obstacles.push(p);
  });
  // Défenseurs au step courant : override > defenseInitial.
  defIds.forEach((dId) => {
    if (movingKind === 'defender' && dId === movingId) return;
    const p = step.defenseOverrides?.[dId]
      ?? (state.defenseInitial as Record<string, Point>)[dId];
    if (p) obstacles.push(p);
  });
  return pushOutOfMany(point, obstacles, PLAYER_MIN_CLEARANCE_PX);
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
  // Anti-superposition : repousse hors des autres joueurs (≥ clearance).
  const safePoint = pushOutOfOtherPlayers(state, 'attacker', id, point);
  if (samePoint(step.off[id], safePoint)) return state;

  const steps = setPlayerPositionAt(state.steps, state.activeStep, id, safePoint);
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

  // Anti-superposition : repousse hors des autres joueurs (≥ clearance).
  const safePoint = pushOutOfOtherPlayers(state, 'defender', id, point);
  const currentOverride = step.defenseOverrides?.[id];
  if (samePoint(currentOverride, safePoint)) return state;
  if (!currentOverride && state.activeStep === 0 && samePoint(state.defenseInitial[id], safePoint)) {
    return state;
  }

  const steps = [...state.steps];
  const cur = { ...step };
  cur.defenseOverrides = { ...cur.defenseOverrides, [id]: safePoint };
  steps[state.activeStep] = cur;
  const defenseInitial =
    state.activeStep === 0 ? { ...state.defenseInitial, [id]: safePoint } : state.defenseInitial;
  return { ...state, steps, defenseInitial };
}
