import { describe, it, expect } from 'vitest';
import type { AttackerPositions, OffensiveScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 120, y: 200 },
  O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
};
const reversal: OffensiveScriptedAction = {
  kind: 'offensive', id: 'rev', type: 'ball-reversal',
  params: { chain: ['O1', 'O2', 'O3'] },
};

describe('ball-chain — intégration compileScenario', () => {
  it('ball-reversal [O1,O2,O3] → le ballon finit sur O3', () => {
    const steps = compileScenario({ initialOff, initialBallCarrier: 'O1', actions: [reversal], playerCount: 5 });
    expect(steps[steps.length - 1].ballCarrier).toBe('O3');
  });

  it('produit des steps avec generatedBy namespacé #lI', () => {
    const steps = compileScenario({ initialOff, initialBallCarrier: 'O1', actions: [reversal], playerCount: 5 });
    expect(steps.some((s) => s.generatedBy === 'rev#l0')).toBe(true);
    expect(steps.some((s) => s.generatedBy === 'rev#l1')).toBe(true);
  });
});
