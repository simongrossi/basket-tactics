import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../metrics';
import { initialOff } from '../../data/initial';
import type { AttackerPositions, ComputedDefense } from '../../types';

const HOOP = { x: 300, y: 75 };

function makeDef(positions: Partial<Record<keyof ComputedDefense, { x: number; y: number; matchedTo?: keyof AttackerPositions; late?: boolean; helpFactor?: number }>>): ComputedDefense {
  const fallback = { x: 0, y: 0 };
  const ids = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
  const matchupFallback: Record<typeof ids[number], keyof AttackerPositions> = {
    D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
  };
  const out = {} as ComputedDefense;
  ids.forEach((id) => {
    const cfg = positions[id];
    out[id] = {
      x: cfg?.x ?? fallback.x,
      y: cfg?.y ?? fallback.y,
      late: cfg?.late ?? false,
      helpFactor: cfg?.helpFactor ?? 0,
      isCarrierDefender: id === 'D1',
      matchedTo: cfg?.matchedTo ?? matchupFallback[id],
      onScreen: false,
      switchedThisStep: false,
      orientation: 0,
      facing: { x: 0, y: 0 },
    };
  });
  return out;
}

describe('computeMetrics', () => {
  it('compte la couverture raquette (défenseurs à <100px du panier)', () => {
    const defPos = makeDef({
      D1: { x: HOOP.x, y: HOOP.y + 50 }, // 50px → in
      D2: { x: HOOP.x, y: HOOP.y + 99 }, // 99 → in
      D3: { x: HOOP.x, y: HOOP.y + 100 }, // 100 → out (strict <)
      D4: { x: 0, y: 500 }, // far
      D5: { x: 600, y: 500 }, // far
    });
    const m = computeMetrics(initialOff, defPos, 'O1');
    expect(m.paintCoverage).toBe(2);
  });

  it('identifie le mostFreeAttacker comme celui dont le défenseur le plus proche est le plus loin', () => {
    // Tous les défenseurs sont collés à leurs hommes sauf D5 → O5 est libre
    const defPos = makeDef({
      D1: { x: initialOff.O1.x, y: initialOff.O1.y, matchedTo: 'O1' },
      D2: { x: initialOff.O2.x, y: initialOff.O2.y, matchedTo: 'O2' },
      D3: { x: initialOff.O3.x, y: initialOff.O3.y, matchedTo: 'O3' },
      D4: { x: initialOff.O4.x, y: initialOff.O4.y, matchedTo: 'O4' },
      D5: { x: 0, y: 0, matchedTo: 'O5' }, // très loin de tout
    });
    const m = computeMetrics(initialOff, defPos, 'O1');
    expect(m.mostFreeAttacker).toBe('O5');
    expect(m.maxGap).toBeGreaterThan(100);
  });

  it("compte les défenseurs en retard via le flag late", () => {
    const defPos = makeDef({
      D1: { x: 0, y: 0, late: true },
      D2: { x: 0, y: 0, late: true },
      D3: { x: 0, y: 0, late: false },
      D4: { x: 0, y: 0 },
      D5: { x: 0, y: 0 },
    });
    const m = computeMetrics(initialOff, defPos, 'O1');
    expect(m.lateCount).toBe(2);
  });

  it("agrège helpFactorTotal en arrondissant à 2 décimales", () => {
    const defPos = makeDef({
      D1: { x: 0, y: 0, helpFactor: 0.333 },
      D2: { x: 0, y: 0, helpFactor: 0.333 },
      D3: { x: 0, y: 0, helpFactor: 0.333 },
      D4: { x: 0, y: 0, helpFactor: 0 },
      D5: { x: 0, y: 0, helpFactor: 0 },
    });
    const m = computeMetrics(initialOff, defPos, 'O1');
    expect(m.helpFactorTotal).toBeCloseTo(1, 1);
  });

  it('classifie les passes en open/contested/blocked selon distance au segment', () => {
    // O1 porteur en (300, 470), 4 cibles. On place 1 défenseur sur la ligne O1→O2,
    // le reste loin. La passe vers O2 doit être bloquée.
    const o1 = initialOff.O1;
    const o2 = initialOff.O2;
    const mid = { x: (o1.x + o2.x) / 2, y: (o1.y + o2.y) / 2 };
    const defPos = makeDef({
      D1: { x: mid.x, y: mid.y, matchedTo: 'O1' }, // sur la ligne O1→O2 → bloque
      D2: { x: 9999, y: 9999, matchedTo: 'O2' },
      D3: { x: 9999, y: 9999, matchedTo: 'O3' },
      D4: { x: 9999, y: 9999, matchedTo: 'O4' },
      D5: { x: 9999, y: 9999, matchedTo: 'O5' },
    });
    const m = computeMetrics(initialOff, defPos, 'O1');
    expect(m.blockedPasses).toBeGreaterThanOrEqual(1);
    expect(m.openPasses + m.contestedPasses + m.blockedPasses).toBe(4);
  });

  it("retourne mostFreeAttacker=null et avgDefenseDist=0 quand off est vide", () => {
    const emptyOff = {} as AttackerPositions;
    const defPos = makeDef({});
    const m = computeMetrics(emptyOff, defPos, 'O1');
    expect(m.mostFreeAttacker).toBeNull();
    expect(m.maxGap).toBe(0);
    // Tous les matchedTo pointent vers des attaquants absents → countMatched = 0
    expect(m.avgDefenseDist).toBe(0);
  });
});
