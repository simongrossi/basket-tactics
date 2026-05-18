// Phase 2 — Moteur symétrique : remplace le stub away par un vrai 5v5.
//
// La possession away n'est plus un fantôme stylisé (intent='away-possession'
// + animation hardcodée), mais un vrai cycle d'IA avec positions mirrored,
// drives, passes, tirs. Le panier cible bascule sur HOOP_OPPOSITE (y=1005)
// quand attackingTeam === 'away'.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
} from '../gameLoop';
import { HALF_COURT_Y } from '../../awayPossessionSetup';

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

describe('Phase 2 — Moteur symétrique away', () => {
  it("après panier home, la phase away n'a plus l'intent 'away-possession' (stub remplacé)", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };

    // Avance jusqu'à la phase away
    for (let i = 0; i < 100; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.attackingTeam === 'away') break;
    }

    expect(state.attackingTeam).toBe('away');
    // Phase 2 : pas de stub. intent doit être un kind "normal" (idle, drive, etc.)
    // PAS 'away-possession'.
    expect(state.intent.kind).not.toBe('away-possession');
  });

  it("phase away après rebond déf : state.off au bas du terrain (zone d'attaque away)", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    // Force tir manqué (pas un made) → rebond défensif possible
    state = { ...state, outcome: 'shot-missed', score: 0, attackingTeam: 'home' };

    // Avance jusqu'à la phase away — offensiveReboundRate: 0 force rebond déf
    for (let i = 0; i < 200; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState, { offensiveReboundRate: 0 });
      if (state.attackingTeam === 'away') break;
    }

    expect(state.attackingTeam).toBe('away');
    // Après rebond défensif, pas d'inbound : away en attack formation
    // au bas du terrain (mirror du source step).
    expect(state.inboundTimerMs).toBeNull();
    const positions = Object.values(state.off);
    const inBottomHalf = positions.filter((p) => p.y > HALF_COURT_Y).length;
    expect(inBottomHalf).toBeGreaterThanOrEqual(3); // majorité bas-court
  });

  it("phase away après panier home : state.off au TOP en BLOB inbound (y < 200)", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };

    for (let i = 0; i < 100; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.attackingTeam === 'away') break;
    }

    expect(state.attackingTeam).toBe('away');
    expect(state.inboundTimerMs).toBe(5_000);
    // BLOB inbound : 5 attaquants au top (y < 200)
    const positions = Object.values(state.off);
    positions.forEach((p) => {
      expect(p.y).toBeLessThan(200);
    });
  });

  it('phase away : le tick produit des actions IA cohérentes (state.intent évolue)', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    state = { ...state, outcome: 'shot-made', score: 2, attackingTeam: 'home' };

    for (let i = 0; i < 100; i++) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.attackingTeam === 'away') break;
    }
    // Ticker quelques fois pour laisser l'IA décider
    const intentKinds = new Set<string>();
    for (let i = 0; i < 30; i++) {
      intentKinds.add(state.intent.kind);
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }

    // Au moins une action IA décidée (drive ou pass)
    const hasAction =
      intentKinds.has('drive') || intentKinds.has('pass') || intentKinds.has('shoot');
    expect(hasAction).toBe(true);
  });
});
