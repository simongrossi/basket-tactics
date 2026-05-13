// Tests F.3 — Free Throw rebound positioning.

import { describe, expect, it } from 'vitest';
import { buildFreeThrowSetup } from '@/lib/logic/freeThrowSetup';
import { convertStepToFreeThrow } from '@/lib/state/transforms/stepTransforms';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { PLAYER_MIN_CLEARANCE_PX, HOOP, PAINT, FT_LINE_Y } from '@/lib/data/court';
import type { AppState } from '@/lib/types';

describe('buildFreeThrowSetup — positions canoniques', () => {
  const ft = buildFreeThrowSetup();

  it('tireur O1 sur la ligne LF (proche y=235)', () => {
    expect(ft.shooter).toBe('O1');
    expect(ft.off.O1.x).toBe(HOOP.x);
    expect(ft.off.O1.y).toBeGreaterThanOrEqual(FT_LINE_Y);
    expect(ft.off.O1.y).toBeLessThanOrEqual(FT_LINE_Y + 30);
  });

  it('défenseurs sur les blocks (D4 droite, D5 gauche)', () => {
    // Block = juste contre la baseline, le plus proche du panier.
    expect(ft.def.D4.y).toBeLessThan(80);
    expect(ft.def.D5.y).toBeLessThan(80);
    expect(ft.def.D4.x).toBeGreaterThan(HOOP.x); // droite
    expect(ft.def.D5.x).toBeLessThan(HOOP.x); // gauche
    // Largeur des blocks ≈ largeur de la raquette.
    expect(ft.def.D4.x).toBeGreaterThan(PAINT.x1);
    expect(ft.def.D4.x).toBeLessThan(PAINT.x2);
  });

  it('attaquants O4/O5 sur les slots juste au-dessus des blocks', () => {
    // Slots offense alignés en x avec les blocks, juste au-dessus en y.
    expect(ft.off.O4.x).toBeCloseTo(ft.def.D4.x, 0);
    expect(ft.off.O5.x).toBeCloseTo(ft.def.D5.x, 0);
    expect(ft.off.O4.y).toBeGreaterThan(ft.def.D4.y);
    expect(ft.off.O5.y).toBeGreaterThan(ft.def.D5.y);
  });

  it('outlets O2/O3 sur les côtés 3pt + matched D2/D3 proches', () => {
    expect(ft.off.O2.x).toBeLessThan(150);
    expect(ft.off.O3.x).toBeGreaterThan(450);
    expect(ft.def.D2.x).toBeGreaterThan(ft.off.O2.x);
    expect(ft.def.D3.x).toBeLessThan(ft.off.O3.x);
  });

  it('INVARIANT : toutes les paires respectent PLAYER_MIN_CLEARANCE_PX', () => {
    const all = [
      ...Object.entries(ft.off),
      ...Object.entries(ft.def),
    ] as Array<[string, { x: number; y: number }]>;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [idA, a] = all[i];
        const [idB, b] = all[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist, `${idA} ↔ ${idB} = ${dist.toFixed(1)}px`).toBeGreaterThanOrEqual(
          PLAYER_MIN_CLEARANCE_PX - 0.5
        );
      }
    }
  });
});

describe('convertStepToFreeThrow — transform pur', () => {
  it('pose context=free-throw + ballCarrier=O1 + manualOverride=true', () => {
    const s0 = makeInitialState();
    const s1 = convertStepToFreeThrow(s0);
    const step = s1.steps[s1.activeStep];
    expect(step.context).toBe('free-throw');
    expect(step.ballCarrier).toBe('O1');
    expect(step.manualOverride).toBe(true);
  });

  it('écrase les annotations existantes (LF = setup figé)', () => {
    const s0 = makeInitialState();
    const s0WithAnno: AppState = {
      ...s0,
      steps: [
        {
          ...s0.steps[0],
          annotations: [{ type: 'pass', fromId: 'O1', toId: 'O2', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } as any],
        },
      ],
    };
    const s1 = convertStepToFreeThrow(s0WithAnno);
    expect(s1.steps[0].annotations).toEqual([]);
  });

  it("pose des defenseOverrides pour les 5 défenseurs", () => {
    const s0 = makeInitialState();
    const s1 = convertStepToFreeThrow(s0);
    const step = s1.steps[s1.activeStep];
    expect(step.defenseOverrides?.D1).toBeDefined();
    expect(step.defenseOverrides?.D5).toBeDefined();
  });

  it('au step 0, synchronise defenseInitial avec les positions LF', () => {
    const s0 = makeInitialState();
    const s1 = convertStepToFreeThrow(s0);
    const ft = buildFreeThrowSetup();
    expect(s1.defenseInitial.D5).toEqual(ft.def.D5);
  });

  it('INVARIANT : engine cohérent après conversion (clearance respectée)', () => {
    const s0 = makeInitialState();
    const s1 = convertStepToFreeThrow(s0);
    const def = effectiveDefensePositions(s1, 0);
    const off = s1.steps[0].off;
    const DEFS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const ATTS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
    DEFS.forEach((dId) => {
      ATTS.forEach((oId) => {
        const d = Math.hypot(def[dId].x - off[oId].x, def[dId].y - off[oId].y);
        expect(d, `${dId} ↔ ${oId}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    });
  });

  it("retourne le state inchangé si activeStep est invalide", () => {
    const s0: AppState = { ...makeInitialState(), steps: [], activeStep: 0 };
    const s1 = convertStepToFreeThrow(s0);
    expect(s1).toBe(s0);
  });
});
