import { describe, it, expect } from 'vitest';
import { addFastBreakSteps } from '@/lib/state/transforms/stepTransforms';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';

function reboundState(): AppState {
  const s0 = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
    O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
  };
  const def: DefenderPositions = {
    D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
    D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
  };
  return {
    ...s0, playerCount: 5, activeStep: 0,
    steps: [{ off, ballCarrier: 'O1', annotations: [], defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive' }],
  };
}

describe('addFastBreakSteps', () => {
  it('appende 2 steps après le rebond + bascule full-court / attackingDirection down', () => {
    const s = addFastBreakSteps(reboundState(), { sourceStepIdx: 0 });
    expect(s.steps).toHaveLength(3);
    expect(s.steps[1].label).toBe('Outlet');
    expect(s.steps[2].label).toBe('Sprint couloirs');
    expect(s.fullCourt).toBe(true);
    expect(s.attackingDirection).toBe('down');
    expect(s.activeStep).toBe(2);
  });

  it('rebond non défensif → no-op', () => {
    const base = reboundState();
    base.steps[0] = { ...base.steps[0], reboundType: 'offensive' };
    const s = addFastBreakSteps(base, { sourceStepIdx: 0 });
    expect(s.steps).toHaveLength(1);
    expect(s).toBe(base);
  });
});
