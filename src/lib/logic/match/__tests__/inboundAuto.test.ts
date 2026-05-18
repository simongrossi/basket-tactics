// Phase 1.1 — Auto-inbound entre possessions.
//
// Après chaque panier marqué, une remise en jeu est mise en place :
// - Panier home marqué → away inbound (timer 5s, inbounder au top y < 20)
// - Panier away marqué → home inbound (timer 5s, inbounder au bottom y > 1060)
// - Rebond off / def : pas d'inbound
// - Turnover : pas d'inbound baseline en V1 (steal direct)

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
} from '../gameLoop';

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
    fullCourt: true,
  };
}

/** Tick jusqu'à atteindre une condition (ou maxTicks). Retourne le dernier
 *  état, qu'il ait satisfait la condition ou non. */
function tickUntil(
  state: ReturnType<typeof createInitialMatchState>,
  baseState: AppState,
  predicate: (s: ReturnType<typeof createInitialMatchState>) => boolean,
  maxTicks = 200
): ReturnType<typeof createInitialMatchState> {
  let cur = state;
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(cur)) return cur;
    cur = tickMatch(cur, MATCH_TICK_MS, baseState);
  }
  return cur;
}

describe('Phase 1.1 — Auto-inbound après panier marqué', () => {
  it('panier home marqué → state away a inboundTimerMs = 5000', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    // Simuler un panier home marqué : outcome shot-made + score 2 sur attaque home
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };
    // Avancer jusqu'à la bascule en possession away (après pause de transition).
    state = tickUntil(state, baseState, (s) => s.attackingTeam === 'away');

    expect(state.attackingTeam).toBe('away');
    expect(state.inboundTimerMs).toBe(5_000);
  });

  it('panier home marqué → 5 away players en BLOB au top (y < 200) pendant inbound visible', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };
    // Bascule en possession away
    state = tickUntil(state, baseState, (s) => s.attackingTeam === 'away');

    // Phase 2 : les positions away vivent maintenant dans state.off
    // (plus dans awayPlayerPositions stub). 5 attaquants away en BLOB
    // box-set au top.
    const positions = Object.values(state.off);
    expect(positions.length).toBe(5);
    positions.forEach((p) => {
      expect(p.y).toBeLessThan(200);
    });
    // L'inbounder (carrier) est derrière la ligne (y < 20)
    const carrierPos = state.off[state.carrier];
    expect(carrierPos).toBeDefined();
    expect(carrierPos!.y).toBeLessThan(20);
    // Le ballon est sur l'inbounder (ballPos prend l'offset visuel +16/-16)
    expect(state.ballPos.y).toBeLessThan(20);
  });

  it('inbound away se termine sans violation au bout de 3s (transition vers stub)', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };
    state = tickUntil(state, baseState, (s) => s.attackingTeam === 'away');

    // Ticker > 5s (= 150 ticks à 33ms) → si on ne désarme pas, l'inbound
    // violation se déclencherait à inboundTimerMs === 0
    for (let i = 0; i < 200; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }

    // Pas de turnover-pass déclenché par la violation
    expect(state.outcome).not.toBe('turnover-pass');
    // L'inbound a été désarmé (pass virtuelle vers le stub)
    expect(state.inboundTimerMs).toBeNull();
  });

  it('inbound away visible : positions restent au top quelques ticks avant que l\'IA bouge', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };
    state = tickUntil(state, baseState, (s) => s.attackingTeam === 'away');

    // Ticker quelques frames (encore proche de l'inbound initial)
    for (let i = 0; i < 10; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }

    // Phase 2 : la majorité des positions reste au top (l'IA n'a pas encore
    // eu le temps de descendre vers la moitié bas en si peu de ticks)
    const positions = Object.values(state.off);
    const topCount = positions.filter((p) => p.y < 300).length;
    expect(topCount).toBeGreaterThanOrEqual(3);
  });

  it('turnover home → bascule away SANS inbound (inboundTimerMs reste null)', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 2, maxPossessions: 3 });
    // Simuler un turnover (interception passe) : pas de score
    state = { ...state, outcome: 'turnover-pass', score: 0, attackingTeam: 'home' };
    state = tickUntil(state, baseState, (s) => s.attackingTeam === 'away');

    expect(state.attackingTeam).toBe('away');
    expect(state.inboundTimerMs).toBeNull();
  });

  it('panier away marqué (stub) → bascule home avec inboundTimerMs = 5000', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 3, maxPossessions: 3 });
    // Construire un état away-possession sur le point de se terminer.
    state = {
      ...state,
      outcome: null,
      score: 0,
      attackingTeam: 'away',
      intent: { kind: 'away-possession', remainingMs: MATCH_TICK_MS },
      shotClockMs: 2_000, // > MATCH_TICK_MS pour ne pas déclencher forced-shot
    };
    // Avancer 1 tick avec override : l'away marque sur cette fin de stub
    const next = tickMatch(state, MATCH_TICK_MS, baseState, { awayScoreOverride: true });

    expect(next.attackingTeam).toBe('home');
    expect(next.awayScore).toBeGreaterThan(state.awayScore);
    expect(next.inboundTimerMs).toBe(5_000);
  });

  it('panier away marqué → carrier home placé derrière la baseline away (y > 1060)', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 5, maxPossessions: 3 });
    state = {
      ...state,
      outcome: null,
      score: 0,
      attackingTeam: 'away',
      intent: { kind: 'away-possession', remainingMs: MATCH_TICK_MS },
      shotClockMs: 2_000,
    };
    const next = tickMatch(state, MATCH_TICK_MS, baseState, { awayScoreOverride: true });

    const carrierPos = next.off[next.carrier];
    expect(carrierPos).toBeDefined();
    // FULL_COURT_HEIGHT = 1080. L'inbounder est derrière la baseline away.
    expect(carrierPos!.y).toBeGreaterThan(1060);
  });

  it('tir adverse manqué (stub) → bascule home SANS inbound', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 4, maxPossessions: 3 });
    state = {
      ...state,
      outcome: null,
      score: 0,
      attackingTeam: 'away',
      intent: { kind: 'away-possession', remainingMs: MATCH_TICK_MS },
      shotClockMs: 2_000, // > MATCH_TICK_MS pour ne pas déclencher forced-shot
    };
    const next = tickMatch(state, MATCH_TICK_MS, baseState, { awayScoreOverride: false });

    expect(next.attackingTeam).toBe('home');
    expect(next.awayScore).toBe(state.awayScore); // pas de score
    expect(next.inboundTimerMs).toBeNull(); // pas d'inbound (rebond live)
  });
});
