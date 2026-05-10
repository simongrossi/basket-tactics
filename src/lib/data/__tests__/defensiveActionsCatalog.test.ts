import { describe, it, expect } from 'vitest';
import {
  DEFENSIVE_ACTIONS_CATALOG,
  ALL_DEFENSIVE_ACTION_TYPES,
} from '@/lib/data/defensiveActionsCatalog';

describe('DEFENSIVE_ACTIONS_CATALOG', () => {
  it('contient les 4 actions MVP + 11 couvertures Tier 2 (Phase 5)', () => {
    expect(ALL_DEFENSIVE_ACTION_TYPES).toEqual(
      expect.arrayContaining([
        // MVP Phase 3
        'help-and-recover', 'pre-switch', 'trap', 'tag',
        // Tier 2 Phase 5
        'over', 'under', 'switch', 'hedge', 'drop', 'blitz', 'ice',
        'flat-hedge', 'peel-switch', 'triple-switch', 'closing-out',
      ])
    );
    expect(ALL_DEFENSIVE_ACTION_TYPES).toHaveLength(15);
  });

  it('chaque action Tier 2 a un reader FR qui mentionne au moins un défenseur', () => {
    const tier2 = [
      'over','under','switch','hedge','drop','blitz','ice',
      'flat-hedge','peel-switch','triple-switch','closing-out',
    ] as const;
    for (const type of tier2) {
      const def = DEFENSIVE_ACTIONS_CATALOG[type];
      const text = def.reader({
        defenders: ['D1'], target: 'O1',
        swapWith: 'D5', thirdSwap: 'D3',
      });
      expect(text, `reader vide pour ${type}`).toBeTruthy();
      expect(text.toLowerCase()).toContain('d1');
    }
  });

  it('triple-switch requiert thirdSwap', () => {
    expect(DEFENSIVE_ACTIONS_CATALOG['triple-switch'].requiredParams).toContain('thirdSwap');
  });

  it('drop accepte dropDepth comme paramètre optionnel', () => {
    expect(DEFENSIVE_ACTIONS_CATALOG.drop.optionalParams).toContain('dropDepth');
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
