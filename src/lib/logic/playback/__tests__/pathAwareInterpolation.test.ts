// Tests PAI V1 — Path-Aware Interpolation.

import { describe, expect, it } from 'vitest';
import {
  PAI_MAX_DEVIATION_PER_FRAME_PX,
  PAI_NEAR_MISS_BUFFER_PX,
  applyPathAwareInterpolation,
} from '@/lib/logic/playback/pathAwareInterpolation';
import { MIN_PLAYER_CLEARANCE_PX } from '@/lib/data/physics';
import type { AttackerPositions, DefenderId, Point } from '@/lib/types';

const P = (x: number, y: number): Point => ({ x, y });

function makeAttackers(overrides: Partial<AttackerPositions> = {}): AttackerPositions {
  return {
    O1: P(100, 100),
    O2: P(200, 100),
    O3: P(300, 100),
    O4: P(400, 100),
    O5: P(500, 100),
    ...overrides,
  };
}

function makeDefenders(overrides: Partial<Record<DefenderId, Point>> = {}): Record<DefenderId, Point> {
  return {
    D1: P(100, 200),
    D2: P(200, 200),
    D3: P(300, 200),
    D4: P(400, 200),
    D5: P(500, 200),
    ...overrides,
  };
}

describe('PAI — constantes calibrées', () => {
  it('buffer = 8 px et max deviation = 6 px', () => {
    expect(PAI_NEAR_MISS_BUFFER_PX).toBe(8);
    expect(PAI_MAX_DEVIATION_PER_FRAME_PX).toBe(6);
  });

  it('threshold détection = MIN_PLAYER_CLEARANCE_PX + buffer = 42 px', () => {
    expect(MIN_PLAYER_CLEARANCE_PX + PAI_NEAR_MISS_BUFFER_PX).toBe(42);
  });
});

describe('PAI — pas de near-miss', () => {
  it('joueurs largement séparés → aucune déviation', () => {
    const att = makeAttackers();
    const def = makeDefenders();
    const out = applyPathAwareInterpolation(att, def, {}, new Set());
    expect(out.pairsDeflected).toBe(0);
    // Positions inchangées
    expect(out.attackers).toEqual(att);
    expect(out.defenders).toEqual(def);
  });

  it('paires à distance > threshold → aucune déviation', () => {
    // O1 et D1 alignés mais à 100 px (>> 42)
    const att = makeAttackers({ O1: P(0, 0) });
    const def = makeDefenders({ D1: P(0, 100) });
    const out = applyPathAwareInterpolation(att, def, {}, new Set());
    expect(out.pairsDeflected).toBe(0);
  });
});

describe('PAI — near-miss détectée et déviée', () => {
  it('attaquant à 30 px d\'un défenseur → déviation symétrique', () => {
    // O1 et D1 à 30 px (< 42) sur l'axe x.
    const att = makeAttackers({ O1: P(0, 0) });
    const def = makeDefenders({ D1: P(30, 0) });
    const out = applyPathAwareInterpolation(att, def, {}, new Set());
    expect(out.pairsDeflected).toBeGreaterThanOrEqual(1);
    // O1 doit avoir bougé vers les x négatifs, D1 vers les x positifs
    expect(out.attackers.O1!.x).toBeLessThan(0);
    expect(out.defenders.D1!.x).toBeGreaterThan(30);
    // Distance après déviation > 30 (un peu plus grand)
    const newDist = Math.hypot(
      out.defenders.D1!.x - out.attackers.O1!.x,
      out.defenders.D1!.y - out.attackers.O1!.y,
    );
    expect(newDist).toBeGreaterThan(30);
  });

  it('intensity proportionnelle à la proximité', () => {
    // Test 2 distances : 40 px (loin du threshold) vs 20 px (proche du contact)
    const att1 = makeAttackers({ O1: P(0, 0) });
    const def1 = makeDefenders({ D1: P(40, 0) });
    const out1 = applyPathAwareInterpolation(att1, def1, {}, new Set());

    const att2 = makeAttackers({ O1: P(0, 0) });
    const def2 = makeDefenders({ D1: P(20, 0) });
    const out2 = applyPathAwareInterpolation(att2, def2, {}, new Set());

    // Déviation à 20 px > déviation à 40 px (plus proche = plus de poussée)
    const dev1 = Math.abs(out1.attackers.O1!.x);
    const dev2 = Math.abs(out2.attackers.O1!.x);
    expect(dev2).toBeGreaterThan(dev1);
  });

  it('cap dur total : chaque joueur bouge ≤ PAI_MAX_DEVIATION_PER_FRAME_PX', () => {
    // Joueurs collés (1 px) → multi-passes les sépare, clamp final cappe
    // le déplacement TOTAL de chaque joueur au cap dur.
    const att = makeAttackers({ O1: P(0, 0) });
    const def = makeDefenders({ D1: P(1, 0) });
    const out = applyPathAwareInterpolation(att, def, {}, new Set());
    const movedO1 = Math.hypot(out.attackers.O1!.x - 0, out.attackers.O1!.y - 0);
    const movedD1 = Math.hypot(out.defenders.D1!.x - 1, out.defenders.D1!.y - 0);
    expect(movedO1).toBeLessThanOrEqual(PAI_MAX_DEVIATION_PER_FRAME_PX + 0.01);
    expect(movedD1).toBeLessThanOrEqual(PAI_MAX_DEVIATION_PER_FRAME_PX + 0.01);
  });

  it('option maxDeviation custom respectée', () => {
    const att = makeAttackers({ O1: P(0, 0) });
    const def = makeDefenders({ D1: P(1, 0) });
    const out = applyPathAwareInterpolation(att, def, {}, new Set(), { maxDeviation: 2 });
    const movedO1 = Math.hypot(out.attackers.O1!.x, out.attackers.O1!.y);
    expect(movedO1).toBeLessThanOrEqual(2.01);
  });

  it('multi-passes résout une chaîne de near-miss (A-B-C alignés serrés)', () => {
    // 3 joueurs alignés à 20 px → chaîne. Le multi-passes les écarte.
    const att = makeAttackers({ O1: P(0, 0), O2: P(20, 0), O3: P(40, 0) });
    const def = makeDefenders();
    const out = applyPathAwareInterpolation(att, def, {}, new Set(), { passes: 3 });
    // Après résolution, O1 et O3 (les extrêmes) se sont écartés.
    expect(out.attackers.O1!.x).toBeLessThan(0);
    expect(out.attackers.O3!.x).toBeGreaterThan(40);
  });
});

describe('PAI — skip rules', () => {
  it('poseur pinné ne bouge pas (Règle 1bis)', () => {
    const att = makeAttackers({ O1: P(0, 0), O5: P(30, 0) });
    const def = makeDefenders();
    // O5 est en train de poser un écran → pinned
    const out = applyPathAwareInterpolation(att, def, { O5: true }, new Set());
    // O5 reste à (30, 0) exact
    expect(out.attackers.O5).toEqual(P(30, 0));
    // O1 a entièrement absorbé la déviation (pas de split)
    expect(out.attackers.O1!.x).toBeLessThan(0);
  });

  it('défenseur stuck d\'écran ne bouge pas (Règle 1bis)', () => {
    const att = makeAttackers();
    const def = makeDefenders({ D1: P(0, 0), D2: P(30, 0) });
    // D1 est stuck à l'écran
    const out = applyPathAwareInterpolation(att, def, {}, new Set(['D1']));
    expect(out.defenders.D1).toEqual(P(0, 0));
    // D2 a entièrement absorbé la déviation
    expect(out.defenders.D2!.x).toBeGreaterThan(30);
  });

  it('deux joueurs pinned → aucune déviation (cas dégénéré)', () => {
    const att = makeAttackers({ O1: P(0, 0), O5: P(30, 0) });
    const def = makeDefenders();
    // O1 et O5 tous deux pinned (cas théorique)
    const out = applyPathAwareInterpolation(att, def, { O1: true, O5: true }, new Set());
    expect(out.pairsDeflected).toBe(0);
    expect(out.attackers.O1).toEqual(P(0, 0));
    expect(out.attackers.O5).toEqual(P(30, 0));
  });

  it('paires totalement superposées (dist < ε) → no-op (solveur final s\'en occupe)', () => {
    const att = makeAttackers({ O1: P(100, 100) });
    const def = makeDefenders({ D1: P(100, 100) });
    const out = applyPathAwareInterpolation(att, def, {}, new Set());
    // dist quasi-zéro → skip pour éviter division par zéro / direction indéfinie
    expect(out.pairsDeflected).toBe(0);
  });
});
