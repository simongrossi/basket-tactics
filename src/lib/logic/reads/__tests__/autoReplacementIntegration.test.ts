import { describe, it, expect } from 'vitest';
import type { AttackerPositions, OffensiveScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 250 }, // top (carrier)
  O2: { x: 480, y: 200 }, // wing droit (cutter)
  O3: { x: 500, y: 320 }, // droite, plus loin → filler
  O4: { x: 120, y: 200 },
  O5: { x: 150, y: 320 },
};
const cut: OffensiveScriptedAction = {
  kind: 'offensive', id: 'c1', type: 'basket-cut', params: { cutter: 'O2' },
};

describe('auto-replacement — intégration compileScenario', () => {
  it('flag off → O3 ne bouge pas (rétrocompat)', () => {
    const steps = compileScenario({ initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5 });
    const cutStep = steps.find((s) => s.generatedBy === 'c1')!;
    expect(cutStep.off.O3).toEqual(initialOff.O3);
  });

  it('flag on → O3 comble le spot vidé par O2', () => {
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5,
      autoReplacementEnabled: true,
    });
    const cutStep = steps.find((s) => s.generatedBy === 'c1')!;
    expect(cutStep.off.O3).not.toEqual(initialOff.O3);
    expect(cutStep.off.O3.y).toBeLessThan(initialOff.O3.y);
  });
});
