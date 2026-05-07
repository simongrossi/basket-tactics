import { describe, it, expect } from 'vitest';
import { computeAttackerThreats, bestOffensiveOption, shotZoneFor } from '../threats';
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
    };
  });
  return out;
}

describe('shotZoneFor', () => {
  it('classifie les zones par distance au panier', () => {
    expect(shotZoneFor(20)).toBe('rim');
    expect(shotZoneFor(60)).toBe('paint');
    expect(shotZoneFor(150)).toBe('mid');
    expect(shotZoneFor(260)).toBe('three');
    expect(shotZoneFor(350)).toBe('deep');
  });
});

describe('computeAttackerThreats', () => {
  const off: AttackerPositions = {
    O1: { x: 300, y: 470 },  // top of arc, ~395px du panier (deep 3)
    O2: { x: 130, y: 380 },  // wing G
    O3: { x: 470, y: 380 },  // wing D
    O4: { x: 220, y: 230 },  // low post G
    O5: { x: 380, y: 105 },  // sous le panier (rim, ~85px)
  };

  it('le porteur a receivability = 1', () => {
    const defPos = makeDefPos({
      D1: { x: 300, y: 380 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const threats = computeAttackerThreats(off, defPos, 'O1', HOOP);
    expect(threats.O1.isCarrier).toBe(true);
    expect(threats.O1.receivability).toBe(1);
    expect(threats.O2.isCarrier).toBe(false);
    expect(threats.O2.receivability).toBeLessThanOrEqual(1);
  });

  it('un défenseur collé contestera fortement le tir', () => {
    const close = makeDefPos({
      D1: { x: 300, y: 470 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const far = makeDefPos({
      D1: { x: 300, y: 200 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    });
    const closeThreats = computeAttackerThreats(off, close, 'O1', HOOP);
    const farThreats = computeAttackerThreats(off, far, 'O1', HOOP);
    // O1 collé (D1 sur O1) → shotQuality réduite par contest
    expect(closeThreats.O1.shotQuality).toBeLessThan(farThreats.O1.shotQuality);
  });

  it('O5 sous le panier (rim) a une shotQuality plus haute que O1 deep', () => {
    const defPos = makeDefPos({
      D1: { x: 0, y: 0 }, D2: { x: 0, y: 0 }, D3: { x: 0, y: 0 },
      D4: { x: 0, y: 0 }, D5: { x: 0, y: 0 },
    });
    const threats = computeAttackerThreats(off, defPos, 'O1', HOOP);
    // O5 rim base 0.65, O1 deep base 0.28. Pas de contest (défenseurs au coin).
    expect(threats.O5.shotQuality).toBeGreaterThan(threats.O1.shotQuality);
  });

  it("bestOffensiveOption renvoie l'attaquant avec le score max", () => {
    const defPos = makeDefPos({
      D1: { x: 300, y: 470 }, D2: { x: 170, y: 310 },
      D3: { x: 430, y: 310 }, D4: { x: 240, y: 160 }, D5: { x: 0, y: 0 },
    });
    const threats = computeAttackerThreats(off, defPos, 'O1', HOOP);
    const best = bestOffensiveOption(threats);
    expect(best).not.toBeNull();
    // Le score le plus haut doit correspondre à un attaquant existant
    expect(['O1', 'O2', 'O3', 'O4', 'O5']).toContain(best!.attackerId);
    // Pas plus grand que tous les autres
    Object.values(threats).forEach((t) => {
      expect(best!.score).toBeGreaterThanOrEqual(t.score);
    });
  });
});
