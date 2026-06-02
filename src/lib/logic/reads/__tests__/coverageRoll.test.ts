import { describe, it, expect } from 'vitest';
import { rollCoverage, coverageBranchStats } from '@/lib/logic/reads/coverageRoll';
import type { AppState, ScenarioBranch, ScreenRule } from '@/lib/types';

const dist = [
  { coverage: 'drop' as ScreenRule, weight: 0.7 },
  { coverage: 'blitz' as ScreenRule, weight: 0.3 },
];

describe('rollCoverage', () => {
  it('déterministe : même seed → même couverture', () => {
    expect(rollCoverage(dist, 123)).toBe(rollCoverage(dist, 123));
  });

  it('distribution mono → toujours cette couverture', () => {
    const mono = [{ coverage: 'switch' as ScreenRule, weight: 1 }];
    for (let seed = 0; seed < 20; seed++) {
      expect(rollCoverage(mono, seed)).toBe('switch');
    }
  });

  it('distribution vide → null', () => {
    expect(rollCoverage([], 1)).toBeNull();
  });

  it('poids total ≤ 0 → null', () => {
    expect(rollCoverage([{ coverage: 'drop', weight: 0 }], 1)).toBeNull();
  });

  it('sur 2000 tirages seedés, fréquences ≈ poids (±5 %)', () => {
    let drop = 0;
    const N = 2000;
    for (let seed = 0; seed < N; seed++) {
      if (rollCoverage(dist, seed) === 'drop') drop++;
    }
    const freq = drop / N;
    expect(freq).toBeGreaterThan(0.65);
    expect(freq).toBeLessThan(0.75);
  });
});

function stateWithBranches(): AppState {
  const branchDrop: ScenarioBranch = {
    id: 'b-drop', label: 'Pull-up', divergeAfterActionId: 'a1',
    actions: [], trigger: { kind: 'screen-coverage', actionId: 'a1', coverage: ['drop'] },
  };
  const branchBlitz: ScenarioBranch = {
    id: 'b-blitz', label: 'Short roll', divergeAfterActionId: 'a1',
    actions: [], trigger: { kind: 'screen-coverage', actionId: 'a1', coverage: ['blitz'] },
  };
  return {
    scenarioBranches: [branchDrop, branchBlitz],
    coverageDistribution: [
      { coverage: 'drop', weight: 0.7 },
      { coverage: 'blitz', weight: 0.3 },
    ],
  } as unknown as AppState;
}

describe('coverageBranchStats', () => {
  it('mappe chaque couverture à sa branche + normalise les poids', () => {
    const stats = coverageBranchStats(stateWithBranches());
    expect(stats).toHaveLength(2);
    const drop = stats.find((s) => s.coverage === 'drop')!;
    expect(drop.branchId).toBe('b-drop');
    expect(drop.branchLabel).toBe('Pull-up');
    expect(drop.weight).toBeCloseTo(0.7, 5);
  });

  it('couverture sans branche → chemin principal', () => {
    const s = stateWithBranches();
    s.coverageDistribution = [{ coverage: 'over', weight: 1 }];
    const stats = coverageBranchStats(s);
    expect(stats[0].branchId).toBeNull();
    expect(stats[0].branchLabel).toBe('chemin principal');
    expect(stats[0].weight).toBeCloseTo(1, 5);
  });

  it('distribution absente → []', () => {
    expect(coverageBranchStats({} as AppState)).toEqual([]);
  });
});
