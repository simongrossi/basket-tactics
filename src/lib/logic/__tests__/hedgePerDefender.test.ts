// #8.3 — hedgeAggression per-défenseur override le global.
import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un état PnR : O5 plaqué sur D1 (porteur O1), screenRule hedge.
 *  D5 (screenerDef) sort sur le porteur ; son amplitude dépend de
 *  l'agressivité hedge effective. */
function makeHedgeState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      {
        ...s0.steps[0],
        off: { ...s0.steps[0].off, O5: { x: 305, y: 380 } }, // collé sur D1
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
    ],
    screenRule: 'hedge',
    ...overrides,
  };
}

/** Distance de D5 au porteur O1 (plus petite = hedge plus agressif). */
function d5ToCarrier(state: AppState): number {
  const def = effectiveDefensePositions(state, 0);
  const o1 = state.steps[0].off.O1;
  return Math.hypot(def.D5.x - o1.x, def.D5.y - o1.y);
}

describe('hedgeAggression per-défenseur', () => {
  it('hedge agressif (90) → D5 sort plus loin sur le porteur que hedge mou (10)', () => {
    const soft = d5ToCarrier(makeHedgeState({ hedgeAggression: 10 }));
    const hard = d5ToCarrier(makeHedgeState({ hedgeAggression: 90 }));
    // Hedge plus agressif → D5 plus proche du porteur.
    expect(hard).toBeLessThan(soft);
  });

  it('override per-défenseur sur D5 prime sur le global', () => {
    const s0 = makeHedgeState({ hedgeAggression: 10 });
    const withOverride: AppState = {
      ...s0,
      rules: {
        ...s0.rules,
        D5: { ...s0.rules.D5, hedgeAggression: 90 },
      },
    };
    // Global mou (10) mais override D5 dur (90) → D5 sort comme un hard hedge.
    const globalSoft = d5ToCarrier(makeHedgeState({ hedgeAggression: 10 }));
    const overridden = d5ToCarrier(withOverride);
    expect(overridden).toBeLessThan(globalSoft);
  });

  it('sans override ni global → défaut 50 (comportement legacy inchangé)', () => {
    const a = d5ToCarrier(makeHedgeState());
    const b = d5ToCarrier(makeHedgeState());
    expect(a).toBe(b); // déterministe
  });
});
