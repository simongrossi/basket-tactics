// Tests A11 Phase 1 — Helpers shotTracking + types.

import { describe, expect, it } from 'vitest';
import type { Step } from '@/lib/types';
import { getShotPosForStep, hasShotOutcome, isMissedShot } from '@/lib/logic/shotTracking';

const baseStep: Step = {
  off: {
    O1: { x: 300, y: 200 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  },
  ballCarrier: 'O1',
  annotations: [],
};

describe('A11 Phase 1 — getShotPosForStep', () => {
  it('retourne shotPos si défini', () => {
    const step: Step = { ...baseStep, shotPos: { x: 250, y: 150 } };
    expect(getShotPosForStep(step, 5)).toEqual({ x: 250, y: 150 });
  });

  it('fallback sur position du porteur si shotPos absent', () => {
    expect(getShotPosForStep(baseStep, 5)).toEqual({ x: 300, y: 200 });
  });

  it('retourne null si position du porteur absente du off (cas dégénéré)', () => {
    const offWithoutCarrier = { ...baseStep.off };
    delete (offWithoutCarrier as Record<string, unknown>).O1;
    delete (offWithoutCarrier as Record<string, unknown>).O2;
    delete (offWithoutCarrier as Record<string, unknown>).O3;
    delete (offWithoutCarrier as Record<string, unknown>).O4;
    delete (offWithoutCarrier as Record<string, unknown>).O5;
    const step: Step = { ...baseStep, off: offWithoutCarrier };
    expect(getShotPosForStep(step, 5)).toBeNull();
  });

  it('clone la position (évite mutation accidentelle)', () => {
    const step: Step = { ...baseStep, shotPos: { x: 250, y: 150 } };
    const pos = getShotPosForStep(step, 5)!;
    pos.x = 9999;
    expect(step.shotPos!.x).toBe(250);
  });
});

describe('A11 Phase 1 — hasShotOutcome + isMissedShot', () => {
  it('hasShotOutcome retourne false pour step sans outcome', () => {
    expect(hasShotOutcome(baseStep)).toBe(false);
  });

  it('hasShotOutcome retourne true pour made et missed', () => {
    expect(hasShotOutcome({ ...baseStep, shotOutcome: 'made' })).toBe(true);
    expect(hasShotOutcome({ ...baseStep, shotOutcome: 'missed' })).toBe(true);
  });

  it('isMissedShot retourne true uniquement pour missed', () => {
    expect(isMissedShot(baseStep)).toBe(false);
    expect(isMissedShot({ ...baseStep, shotOutcome: 'made' })).toBe(false);
    expect(isMissedShot({ ...baseStep, shotOutcome: 'missed' })).toBe(true);
  });
});
