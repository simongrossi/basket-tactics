import { describe, it, expect } from 'vitest';
import { simulatePossessions } from '../simulator';
import { HOOP } from '../../data/court';
import type { AttackerPositions, ComputedDefense } from '../../types';

function makeDefPos(positions: Record<string, { x: number; y: number }>): ComputedDefense {
  const out = {} as ComputedDefense;
  (Object.keys(positions) as Array<keyof typeof positions>).forEach((dId) => {
    out[dId as 'D1' | 'D2' | 'D3' | 'D4' | 'D5'] = {
      x: positions[dId].x,
      y: positions[dId].y,
      late: false,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: 'O1',
      onScreen: false,
      switchedThisStep: false,
      orientation: 0,
      gazeOrientation: 0,
      facing: { x: 0, y: 0 },
      armBallSide: { x: 0, y: 0 },
      armManSide: { x: 0, y: 0 },
    };
  });
  return out;
}

/** RNG seeded déterministe (mulberry32) pour reproductibilité des tests. */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('simulatePossessions', () => {
  const off: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 130, y: 380 },
    O3: { x: 470, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 305, y: 95 },
  };

  it('renvoie un PPP cohérent (entre 0 et 3)', () => {
    const defPos = makeDefPos({
      D1: { x: 300, y: 380 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const r = simulatePossessions(off, defPos, 'O1', 100, HOOP, seededRng(42));
    expect(r.runs).toBe(100);
    expect(r.ppp).toBeGreaterThanOrEqual(0);
    expect(r.ppp).toBeLessThanOrEqual(3);
    expect(r.efgPct).toBeGreaterThanOrEqual(0);
    expect(r.efgPct).toBeLessThanOrEqual(1.5);
  });

  it('défense lockdown (5 défenseurs sur les attaquants) → PPP plus faible que défense absente', () => {
    const lockdown = makeDefPos({
      D1: { x: 300, y: 470 },  // sur O1
      D2: { x: 130, y: 380 },  // sur O2
      D3: { x: 470, y: 380 },  // sur O3
      D4: { x: 220, y: 230 },  // sur O4
      D5: { x: 305, y: 95 },   // sur O5 rim
    });
    const absent = makeDefPos({
      D1: { x: -500, y: -500 }, D2: { x: -500, y: -500 },
      D3: { x: -500, y: -500 }, D4: { x: -500, y: -500 }, D5: { x: -500, y: -500 },
    });
    const lockResult = simulatePossessions(off, lockdown, 'O1', 500, HOOP, seededRng(1));
    const absentResult = simulatePossessions(off, absent, 'O1', 500, HOOP, seededRng(1));
    expect(lockResult.ppp).toBeLessThan(absentResult.ppp);
  });

  it('outcomes counts somment au nombre de runs', () => {
    const defPos = makeDefPos({
      D1: { x: 300, y: 380 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const r = simulatePossessions(off, defPos, 'O1', 200, HOOP, seededRng(99));
    const total = Object.values(r.outcomes).reduce((s, v) => s + v, 0);
    expect(total).toBe(200);
  });

  it('runs=0 retourne ppp=0 sans crash', () => {
    const defPos = makeDefPos({
      D1: { x: 300, y: 380 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const r = simulatePossessions(off, defPos, 'O1', 0, HOOP, seededRng(0));
    expect(r.runs).toBe(0);
    expect(r.ppp).toBe(0);
  });

  it('reproductibilité avec RNG seedé', () => {
    const defPos = makeDefPos({
      D1: { x: 300, y: 380 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const r1 = simulatePossessions(off, defPos, 'O1', 100, HOOP, seededRng(7));
    const r2 = simulatePossessions(off, defPos, 'O1', 100, HOOP, seededRng(7));
    expect(r1.ppp).toBe(r2.ppp);
    expect(r1.totalPoints).toBe(r2.totalPoints);
  });
});
