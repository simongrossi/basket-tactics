import { describe, it, expect } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { congestionFactor } from '@/lib/logic/geometry';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { distance } from '@/lib/logic/geometry';

// ---------------------------------------------------------------------------
// P3.3 — facteur de congestion (densité de corps sur le trajet)
// ---------------------------------------------------------------------------

describe('congestionFactor — helper pur', () => {
  const from = { x: 100, y: 300 };
  const to = { x: 400, y: 300 };

  it('0 ou 1 voisin proche du trajet → pas de pénalité (proximityFriction gère le contact simple)', () => {
    expect(congestionFactor(from, to, [])).toBe(1);
    expect(congestionFactor(from, to, [{ x: 250, y: 340 }])).toBe(1);
  });

  it('la pénalité croît avec la densité (2, 3, 4 corps sur le trajet)', () => {
    const near = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ x: 180 + i * 45, y: 340 }));
    const f2 = congestionFactor(from, to, near(2));
    const f3 = congestionFactor(from, to, near(3));
    const f4 = congestionFactor(from, to, near(4));
    expect(f2).toBeLessThan(1);
    expect(f3).toBeLessThan(f2);
    expect(f4).toBeLessThan(f3);
  });

  it('plancher : même une foule ne fige jamais le défenseur (≥ 0.55)', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ x: 150 + i * 30, y: 320 }));
    expect(congestionFactor(from, to, crowd)).toBeGreaterThanOrEqual(0.55);
  });

  it('corps loin du trajet (> 55 px) → ignorés', () => {
    const far = [
      { x: 200, y: 380 }, { x: 250, y: 390 }, { x: 300, y: 400 },
    ];
    expect(congestionFactor(from, to, far)).toBe(1);
  });

  it('trajet dégénéré (from = to) → 1', () => {
    expect(congestionFactor(from, from, [{ x: 100, y: 310 }])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P3.3 — câblage state.congestionPenaltyEnabled dans speedConstraint
// ---------------------------------------------------------------------------

const offPrev: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 80, y: 300 },
  // Trio massé au milieu du terrain : le trajet de D2 devra le traverser.
  O3: { x: 250, y: 260 },
  O4: { x: 300, y: 250 },
  O5: { x: 350, y: 260 },
};
const offCur: AttackerPositions = {
  ...offPrev,
  O2: { x: 520, y: 300 }, // O2 traverse le terrain → D2 doit suivre à travers la foule
};

function makeCongestionState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  const defenseInitial: DefenderPositions = {
    D1: { x: 300, y: 430 },
    D2: { x: 90, y: 260 },
    D3: { x: 250, y: 220 },
    D4: { x: 300, y: 210 },
    D5: { x: 350, y: 220 },
  };
  return {
    ...s0,
    congestionPenaltyEnabled: enabled || undefined,
    defenseInitial,
    triggers: { drive: false, post: false, paint: false, trap: false },
    steps: [
      { ...s0.steps[0], off: offPrev, ballCarrier: 'O1' },
      { ...s0.steps[0], off: offCur, ballCarrier: 'O1' },
    ],
  };
}

describe('congestionPenaltyEnabled — intégration speedConstraint', () => {
  it('flag on → D2 parcourt moins de distance à travers la foule (plus « en retard »)', () => {
    const base = effectiveDefensePositions(makeCongestionState(false), 1);
    const congested = effectiveDefensePositions(makeCongestionState(true), 1);
    const prevBase = effectiveDefensePositions(makeCongestionState(false), 0);
    const prevCong = effectiveDefensePositions(makeCongestionState(true), 0);
    const traveledBase = distance(prevBase.D2, base.D2);
    const traveledCong = distance(prevCong.D2, congested.D2);
    expect(traveledCong).toBeLessThan(traveledBase);
  });

  it('flag off → strictement identique au legacy', () => {
    const a = effectiveDefensePositions(makeCongestionState(false), 1);
    const b = effectiveDefensePositions(
      { ...makeCongestionState(false), congestionPenaltyEnabled: undefined } as AppState, 1
    );
    expect(a.D2.x).toBeCloseTo(b.D2.x, 9);
    expect(a.D2.y).toBeCloseTo(b.D2.y, 9);
  });
});
