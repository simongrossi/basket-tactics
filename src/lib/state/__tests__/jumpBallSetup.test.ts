// Tests E.2 — jump ball / entre-deux initial.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { convertStepToJumpBall } from '../transforms/stepTransforms';
import { distance } from '@/lib/logic/geometry';
import { PLAYER_RADIUS } from '@/lib/data/court';
import type { AppState } from '@/lib/types';

const MIN_CLEARANCE = PLAYER_RADIUS * 2 + 2; // 34

function withJumpBall(): AppState {
  return convertStepToJumpBall(makeInitialState());
}

describe('convertStepToJumpBall — basic', () => {
  it('pose context=jump-ball + manualOverride + carrier=O1', () => {
    const s = withJumpBall();
    const step = s.steps[s.activeStep];
    expect(step.context).toBe('jump-ball');
    expect(step.manualOverride).toBe(true);
    expect(step.ballCarrier).toBe('O1');
  });

  it("vide les annotations existantes", () => {
    const s = makeInitialState();
    const dirty = {
      ...s,
      steps: [
        {
          ...s.steps[0],
          annotations: [
            { type: 'pass' as const, fromId: 'O1' as const, toId: 'O2' as const, from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
          ],
        },
      ],
    };
    const result = convertStepToJumpBall(dirty);
    expect(result.steps[result.activeStep].annotations).toEqual([]);
  });

  it('pose defenseOverrides pour figer le placement', () => {
    const s = withJumpBall();
    const step = s.steps[s.activeStep];
    expect(step.defenseOverrides).toBeDefined();
    expect(Object.keys(step.defenseOverrides ?? {})).toHaveLength(5);
  });
});

describe('convertStepToJumpBall — positions', () => {
  it("les 2 jumpers (O1 et D1) sont proches du centre y=540", () => {
    const s = withJumpBall();
    const step = s.steps[s.activeStep];
    const o1 = step.off.O1;
    const d1 = step.defenseOverrides?.D1;
    expect(d1).toBeDefined();
    expect(Math.abs(o1.y - 540)).toBeLessThan(50);
    if (d1) {
      expect(Math.abs(d1.y - 540)).toBeLessThan(50);
    }
  });

  it("les 2 jumpers sont à MIN_CLEARANCE ≥ 34 px l'un de l'autre", () => {
    const s = withJumpBall();
    const step = s.steps[s.activeStep];
    const o1 = step.off.O1;
    const d1 = step.defenseOverrides?.D1;
    if (d1) {
      expect(distance(o1, d1)).toBeGreaterThanOrEqual(MIN_CLEARANCE - 0.01);
    }
  });

  it("toutes les paires de joueurs respectent MIN_CLEARANCE (Règle 1)", () => {
    const s = withJumpBall();
    const step = s.steps[s.activeStep];
    const allPlayers: Array<{ id: string; pos: { x: number; y: number } }> = [];
    (['O1', 'O2', 'O3', 'O4', 'O5'] as const).forEach((id) => {
      allPlayers.push({ id, pos: step.off[id] });
    });
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((id) => {
      const p = step.defenseOverrides?.[id];
      if (p) allPlayers.push({ id, pos: p });
    });
    for (let i = 0; i < allPlayers.length; i += 1) {
      for (let j = i + 1; j < allPlayers.length; j += 1) {
        const d = distance(allPlayers[i].pos, allPlayers[j].pos);
        expect(d).toBeGreaterThanOrEqual(MIN_CLEARANCE - 0.01);
      }
    }
  });
});
