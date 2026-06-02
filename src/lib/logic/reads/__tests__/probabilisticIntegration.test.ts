import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { buildDefenseFrameContext } from '@/lib/logic/defense/context';

/** PnR : O5 plaqué sur D1 (porteur O1). screenRule global = 'drop'. */
function makePnRState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      {
        ...s0.steps[0],
        off: { ...s0.steps[0].off, O5: { x: 305, y: 380 } },
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
    ],
    screenRule: 'drop',
    ...overrides,
  };
}

describe('lecture probabiliste — intégration', () => {
  it('mode off → effectiveScreenRule = screenRule global (legacy)', () => {
    const { ctx } = buildDefenseFrameContext(makePnRState(), 0);
    expect(ctx.effectiveScreenRule).toBe('drop');
  });

  it('mode on + rolledCoverage=blitz → effectiveScreenRule=blitz (pilote la défense)', () => {
    const { ctx } = buildDefenseFrameContext(
      makePnRState({ probabilisticReadsEnabled: true, rolledCoverage: 'blitz' }),
      0,
    );
    expect(ctx.effectiveScreenRule).toBe('blitz');
  });

  it('mode on mais rolledCoverage absent → fallback screenRule global', () => {
    const { ctx } = buildDefenseFrameContext(
      makePnRState({ probabilisticReadsEnabled: true }),
      0,
    );
    expect(ctx.effectiveScreenRule).toBe('drop');
  });

  it('override par défenseur (screenNav) garde sa précédence sur rolledCoverage', () => {
    const s = makePnRState({ probabilisticReadsEnabled: true, rolledCoverage: 'blitz' });
    const { ctx: probe } = buildDefenseFrameContext(s, 0);
    const carrierDef = probe.screen!.carrierDef;
    s.rules = { ...s.rules, [carrierDef]: { ...s.rules[carrierDef], screenNav: 'switch' } };
    const { ctx } = buildDefenseFrameContext(s, 0);
    expect(ctx.effectiveScreenRule).toBe('switch');
  });
});
