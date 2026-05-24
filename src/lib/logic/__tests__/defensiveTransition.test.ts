// Tests "Repli défensif" (ROADMAP 5.2) — flag opt-in qui anime les
// ex-attaquants vers leur propre panier pendant la pause de transition
// quand la possession va basculer.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerId, DefenderId } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import {
  MATCH_TICK_MS,
  createInitialMatchState,
  tickMatch,
} from '../match/gameLoop';
import type { AiPossessionOutcome } from '../match/aiPossession';
import { HOOP, HOOP_OPPOSITE, PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

function baseStateFromTemplate(tplId: string, overrides: Partial<AppState> = {}): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
    ...overrides,
  };
}

/** Met l'état du match en pause de transition avec un outcome donné +
 *  optionnellement un pendingRebound. Permet de tester l'animation
 *  de repli isolément. */
function makeTransitionScenario(
  outcome: AiPossessionOutcome,
  reboundType: 'offensive' | 'defensive' | null,
  flagOn: boolean,
) {
  const baseState = baseStateFromTemplate('pnr-central', {
    defensiveTransitionEnabled: flagOn,
  });
  const state = createInitialMatchState(baseState, { seed: 1 });
  // Place les attaquants côté "panier home" (en haut, y bas) — ils auront
  // ainsi à se replier vers le panier opposé (en bas, y haut) au repli.
  state.off.O1 = { x: 300, y: 200 };
  state.off.O2 = { x: 200, y: 200 };
  state.off.O3 = { x: 400, y: 200 };
  state.off.O4 = { x: 250, y: 180 };
  state.off.O5 = { x: 350, y: 180 };
  state.outcome = outcome;
  if (reboundType) {
    state.pendingRebound = {
      rebounder: reboundType === 'offensive' ? 'O1' : 'D1',
      type: reboundType,
      weights: {},
      position: { x: 300, y: 130 },
    };
  }
  state.transitionStartedAtMs = 0;
  state.possessionTimeMs = 100;
  return { baseState, state };
}

describe('Repli défensif (defensiveTransitionEnabled)', () => {
  it('après shot-made : les ex-attaquants se rapprochent de leur propre panier', () => {
    const off = makeTransitionScenario('shot-made', null, false);
    const on = makeTransitionScenario('shot-made', null, true);

    const nextOff = tickMatch(off.state, MATCH_TICK_MS, off.baseState);
    const nextOn = tickMatch(on.state, MATCH_TICK_MS, on.baseState);

    // Le panier OWN des ex-home-attaquants = HOOP_OPPOSITE (panier en bas,
    // y plus grand) puisque attackingDirection='down' → home attaque
    // HOOP_OPPOSITE en haut, et leur OWN est HOOP en bas.
    // En `attackingDirection='up'` (default), home attaque HOOP (y=75),
    // donc OWN = HOOP_OPPOSITE (y plus bas).
    // Vérifions juste : la distance au panier OWN diminue avec le flag actif,
    // strictement plus que sans le flag.
    const ownHoopForHome = on.baseState.attackingDirection === 'down' ? HOOP : HOOP_OPPOSITE;
    const dOff = Math.hypot(
      nextOff.off.O1.x - ownHoopForHome.x,
      nextOff.off.O1.y - ownHoopForHome.y,
    );
    const dOn = Math.hypot(
      nextOn.off.O1.x - ownHoopForHome.x,
      nextOn.off.O1.y - ownHoopForHome.y,
    );
    expect(dOn).toBeLessThan(dOff);
  });

  it('après turnover-pass : repli actif', () => {
    const { state, baseState } = makeTransitionScenario('turnover-pass', null, true);
    const before = { ...state.off.O1 };
    const next = tickMatch(state, MATCH_TICK_MS, baseState);
    // O1 a bougé strictement.
    const moved = Math.hypot(next.off.O1.x - before.x, next.off.O1.y - before.y);
    expect(moved).toBeGreaterThan(0.5);
  });

  it('après shot-missed + rebond offensif : PAS de repli (même équipe garde possession)', () => {
    const { state, baseState } = makeTransitionScenario('shot-missed', 'offensive', true);
    const o1Before = { ...state.off.O1 };
    const o2Before = { ...state.off.O2 };
    const next = tickMatch(state, MATCH_TICK_MS, baseState);
    // Les positions ne doivent pas bouger par le repli (box-out lerp inactif
    // car defPos n'est pas configuré spécifiquement, mais surtout le code
    // de repli est court-circuité).
    expect(next.off.O1.x).toBeCloseTo(o1Before.x, 1);
    expect(next.off.O1.y).toBeCloseTo(o1Before.y, 1);
    expect(next.off.O2.x).toBeCloseTo(o2Before.x, 1);
    expect(next.off.O2.y).toBeCloseTo(o2Before.y, 1);
  });

  it('après shot-missed + rebond défensif : repli actif (possession bascule)', () => {
    const { state, baseState } = makeTransitionScenario('shot-missed', 'defensive', true);
    const before = { ...state.off.O1 };
    const next = tickMatch(state, MATCH_TICK_MS, baseState);
    const moved = Math.hypot(next.off.O1.x - before.x, next.off.O1.y - before.y);
    expect(moved).toBeGreaterThan(0.5);
  });

  it('respecte la clearance Rule 1 (34 px) entre tous les joueurs', () => {
    const { state, baseState } = makeTransitionScenario('shot-made', null, true);
    const next = tickMatch(state, MATCH_TICK_MS, baseState);

    const attIds = Object.keys(next.off) as AttackerId[];
    const defIds = Object.keys(next.defPos) as DefenderId[];
    for (let i = 0; i < attIds.length; i++) {
      for (let j = i + 1; j < attIds.length; j++) {
        const a = next.off[attIds[i]];
        const b = next.off[attIds[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      }
    }
    for (const aid of attIds) {
      for (const did of defIds) {
        const a = next.off[aid];
        const d = next.defPos[did];
        const dist = Math.hypot(a.x - d.x, a.y - d.y);
        expect(dist).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      }
    }
  });

  it("flag off : aucun mouvement induit par la transition", () => {
    const { state, baseState } = makeTransitionScenario('shot-made', null, false);
    const o1Before = { ...state.off.O1 };
    const next = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(next.off.O1.x).toBeCloseTo(o1Before.x, 1);
    expect(next.off.O1.y).toBeCloseTo(o1Before.y, 1);
  });
});
