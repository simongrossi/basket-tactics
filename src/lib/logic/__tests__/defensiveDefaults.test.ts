import { describe, it, expect } from 'vitest';
import { inferDefensiveDefaults } from '@/lib/logic/defensiveDefaults';
import type { OffensiveScriptedAction } from '@/lib/types';

const pnr: OffensiveScriptedAction = {
  kind: 'offensive', id: 'a1', type: 'pick-and-roll',
  params: { ballHandler: 'O1', screener: 'O5' },
};

describe('inferDefensiveDefaults', () => {
  it('trap sur PnR : trappeurs = défenseurs du porteur + screener, target = porteur', () => {
    const p = inferDefensiveDefaults('trap', pnr);
    expect(p.defenders).toEqual(['D1', 'D5']);
    expect(p.target).toBe('O1');
  });

  it('tag sur PnR : 1 low-man, target = screener', () => {
    const p = inferDefensiveDefaults('tag', pnr);
    expect(p.defenders).toHaveLength(1);
    expect(p.target).toBe('O5');
  });

  it('pre-switch sur PnR : D1 swap D5', () => {
    const p = inferDefensiveDefaults('pre-switch', pnr);
    expect(p.defenders).toEqual(['D1']);
    expect(p.swapWith).toBe('D5');
  });
});
