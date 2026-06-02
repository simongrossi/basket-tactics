import { describe, it, expect } from 'vitest';
import {
  toggleProbabilisticReads,
  setCoverageDistribution,
  rerollCoverage,
} from '@/lib/state/transforms/scenarioTransforms';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function base(): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    scriptedActions: [],
    coverageDistribution: [
      { coverage: 'drop', weight: 0.7 },
      { coverage: 'blitz', weight: 0.3 },
    ],
    coverageRollSeed: 0,
  };
}

describe('transforms lecture probabiliste', () => {
  it('toggle on/off', () => {
    const on = toggleProbabilisticReads(base(), true);
    expect(on.probabilisticReadsEnabled).toBe(true);
    const off = toggleProbabilisticReads(on, false);
    expect(off.probabilisticReadsEnabled).toBe(false);
  });

  it('setCoverageDistribution pose la distribution + tire une rolledCoverage ∈ dist', () => {
    const s = setCoverageDistribution(
      { ...base(), probabilisticReadsEnabled: true },
      [{ coverage: 'switch', weight: 1 }],
    );
    expect(s.coverageDistribution).toEqual([{ coverage: 'switch', weight: 1 }]);
    expect(s.rolledCoverage).toBe('switch');
  });

  it('rerollCoverage bump le seed et recompute rolledCoverage de façon déterministe', () => {
    const s0 = { ...base(), probabilisticReadsEnabled: true };
    const s1 = rerollCoverage(s0);
    expect(s1.coverageRollSeed).toBe((s0.coverageRollSeed ?? 0) + 1);
    expect(['drop', 'blitz']).toContain(s1.rolledCoverage);
    // Reproductible : repartir du même état → même résultat.
    const s1bis = rerollCoverage(s0);
    expect(s1bis.rolledCoverage).toBe(s1.rolledCoverage);
  });
});
