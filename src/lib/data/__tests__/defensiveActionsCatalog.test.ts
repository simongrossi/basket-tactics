import { describe, it, expect } from 'vitest';
import {
  DEFENSIVE_ACTIONS_CATALOG,
  ALL_DEFENSIVE_ACTION_TYPES,
} from '@/lib/data/defensiveActionsCatalog';

describe('DEFENSIVE_ACTIONS_CATALOG', () => {
  it('contient les 4 actions MVP', () => {
    expect(ALL_DEFENSIVE_ACTION_TYPES).toEqual(
      expect.arrayContaining(['help-and-recover', 'pre-switch', 'trap', 'tag'])
    );
    expect(ALL_DEFENSIVE_ACTION_TYPES).toHaveLength(4);
  });

  it('chaque action a un reader FR fonctionnel', () => {
    const trap = DEFENSIVE_ACTIONS_CATALOG.trap;
    expect(trap.reader({ defenders: ['D1', 'D5'], target: 'O1' }))
      .toContain('D1');
  });

  it('trap requiert defenders + target', () => {
    expect(DEFENSIVE_ACTIONS_CATALOG.trap.requiredParams).toContain('defenders');
    expect(DEFENSIVE_ACTIONS_CATALOG.trap.requiredParams).toContain('target');
  });

  it('pre-switch requiert swapWith', () => {
    expect(DEFENSIVE_ACTIONS_CATALOG['pre-switch'].requiredParams).toContain('swapWith');
  });
});
