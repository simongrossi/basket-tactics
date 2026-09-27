// Transition sous-projet 1 — fast-break : outlet + sprint des couloirs en
// full-court, joué par l'équipe qui sécurise le rebond défensif (mapping D→O
// sans miroir). Pur. Voir docs/superpowers/specs/
// 2026-06-02-fast-break-outlet-lanes-design.md.

import type {
  AppState, AttackerId, AttackerPositions, DefenderId, DefenderPositions, Point, Step,
} from '../types';
import { getActiveAttackerIds, getActiveDefenderIds } from './players';
import { effectiveDefensePositions } from './engine';
import { distance, pushOutOfMany } from './geometry';
import { PLAYER_MIN_CLEARANCE_PX } from '../data/court';

const LANE_LEFT_X = 110;
const LANE_MID_X = 300;
const LANE_RIGHT_X = 490;
const SPRINT_BALL_Y = 780;
const SPRINT_WING_Y = 840;
const TRAILER1_Y = 560;
const TRAILER2_Y = 650;
const OUTLET_Y = 420;

/** Attaquant le plus proche du rebondeur (hors lui) = vient chercher l'outlet. */
export function selectOutletReceiver(
  off: AttackerPositions,
  rebounderId: AttackerId,
  active: AttackerId[],
): AttackerId {
  let best: AttackerId | null = null;
  let bestD = Infinity;
  for (const id of active) {
    if (id === rebounderId) continue;
    const d = distance(off[id], off[rebounderId]);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best ?? rebounderId;
}

/** Sépare les positions pour respecter la clearance (Règle 1). */
function spread(off: AttackerPositions, ids: AttackerId[]): void {
  for (const id of ids) {
    const others = ids.filter((o) => o !== id).map((o) => off[o]);
    off[id] = pushOutOfMany(off[id], others, PLAYER_MIN_CLEARANCE_PX);
  }
}

/** Construit les 2 steps du fast-break à partir d'un step de rebond défensif.
 *  Renvoie null si le step n'est pas un rebond défensif. */
export function buildFastBreakSteps(
  state: AppState,
  reboundStepIdx: number,
): { outletStep: Step; sprintStep: Step } | null {
  const src = state.steps[reboundStepIdx];
  if (!src || src.reboundType !== 'defensive') return null;

  const attackerIds = getActiveAttackerIds(state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);

  // Équipe qui rebondit (les D) → attaquants du break, positions conservées.
  const srcDef = src.defenseOverrides ?? effectiveDefensePositions(state, reboundStepIdx);
  const breakOff: AttackerPositions = {} as AttackerPositions;
  attackerIds.forEach((oId, i) => {
    const dId = defenderIds[i];
    breakOff[oId] = { ...(srcDef[dId] ?? { x: 300, y: 120 }) };
  });
  // Tireurs (les O) → défenseurs du break (point de départ avant repli).
  const breakDefStart: DefenderPositions = {} as DefenderPositions;
  defenderIds.forEach((dId, i) => {
    const oId = attackerIds[i];
    breakDefStart[dId] = { ...(src.off[oId] ?? { x: 300, y: 300 }) };
  });

  // Rebondeur (DefenderId) → AttackerId par index.
  const rebDef = src.rebounder as DefenderId | undefined;
  const rIdx = rebDef ? Math.max(0, defenderIds.indexOf(rebDef)) : 0;
  const rebounderO = attackerIds[rIdx];
  const ball = selectOutletReceiver(breakOff, rebounderO, attackerIds);

  // --- Outlet step ---
  const outletOff: AttackerPositions = { ...breakOff };
  outletOff[ball] = { x: breakOff[ball].x < 300 ? 160 : 440, y: OUTLET_Y };
  spread(outletOff, attackerIds);
  const outletStep: Step = {
    label: 'Outlet', off: outletOff, ballCarrier: ball, annotations: [],
    manualOverride: true, defenseOverrides: breakDefStart, context: 'live-play',
  };

  // --- Sprint step ---
  const sprintOff: AttackerPositions = { ...outletOff };
  sprintOff[ball] = { x: LANE_MID_X, y: SPRINT_BALL_Y };
  sprintOff[rebounderO] = { x: LANE_MID_X, y: TRAILER1_Y };
  const others = attackerIds
    .filter((id) => id !== ball && id !== rebounderO)
    .sort((a, b) => outletOff[a].x - outletOff[b].x);
  if (others.length >= 1) sprintOff[others[0]] = { x: LANE_LEFT_X, y: SPRINT_WING_Y };
  if (others.length >= 2) sprintOff[others[others.length - 1]] = { x: LANE_RIGHT_X, y: SPRINT_WING_Y };
  if (others.length >= 3) sprintOff[others[1]] = { x: LANE_MID_X, y: TRAILER2_Y };
  spread(sprintOff, attackerIds);

  // Repli défensif : calculé par le moteur (defense/transitionDefense.ts) —
  // arrêter le ballon, protéger le panier, premier attaquant disponible —
  // au lieu d'une ligne figée.
  const sprintStep: Step = {
    label: 'Sprint couloirs', off: sprintOff, ballCarrier: ball, annotations: [],
    sprintBoost: true, transitionDefense: true, manualOverride: true, context: 'live-play',
  };

  return { outletStep, sprintStep };
}
