import { describe, it, expect } from 'vitest';
import { applyDirective } from '@/lib/logic/applyDirective';
import type { DefenderPositions, DefensiveDirective, Step } from '@/lib/types';

const baseStep = (overrides: Partial<Step> = {}): Step => ({
  off: {
    O1: { x: 300, y: 200 },
    O2: { x: 100, y: 250 },
    O3: { x: 500, y: 250 },
    O4: { x: 200, y: 100 },
    O5: { x: 350, y: 150 },
  },
  ballCarrier: 'O1',
  annotations: [],
  ...overrides,
});

const baseDef = (): DefenderPositions => ({
  D1: { x: 300, y: 220 },
  D2: { x: 110, y: 260 },
  D3: { x: 510, y: 260 },
  D4: { x: 210, y: 110 },
  D5: { x: 360, y: 160 },
});

describe('applyDirective — trap', () => {
  it("place les 2 trappeurs en V autour du target", () => {
    const step = baseStep();
    const targets = baseDef();
    const dir: DefensiveDirective = {
      type: 'trap', defenders: ['D1', 'D5'], target: 'O1',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    const o1 = step.off.O1;
    // D1 doit être à ~80 px de O1
    const d1Dist = Math.hypot(targets.D1.x - o1.x, targets.D1.y - o1.y);
    expect(d1Dist).toBeGreaterThan(60);
    expect(d1Dist).toBeLessThan(110);
    // D5 idem
    const d5Dist = Math.hypot(targets.D5.x - o1.x, targets.D5.y - o1.y);
    expect(d5Dist).toBeGreaterThan(60);
    expect(d5Dist).toBeLessThan(110);
    // les deux doivent être de part et d'autre de la ligne O1→panier (V)
    // donc leurs x doivent être différents
    expect(targets.D1.x).not.toBe(targets.D5.x);
  });
});

describe('applyDirective — tag', () => {
  it("place le low-man entre son homme et le roller, plus proche du roller", () => {
    const step = baseStep();
    const targets = baseDef();
    // assignationOverrides : D4 défend O4, on tag O5 (le roller)
    step.assignmentOverrides = { D4: 'O4' };
    const dir: DefensiveDirective = {
      type: 'tag', defenders: ['D4'], target: 'O5',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D4 doit être entre O4 (sa position) et O5 (target), pondéré vers O5
    const o4 = step.off.O4;
    const o5 = step.off.O5;
    const d4 = targets.D4;
    // d4 doit être à ~60 % du segment O4→O5 (40% offset vers le roller)
    const dxToO5 = Math.hypot(d4.x - o5.x, d4.y - o5.y);
    const dxToO4 = Math.hypot(d4.x - o4.x, d4.y - o4.y);
    expect(dxToO5).toBeLessThan(dxToO4);
  });
});

describe('applyDirective — help-and-recover', () => {
  it("engage : helper se déplace vers le target", () => {
    const step = baseStep();
    const targets = baseDef();
    const before = { ...targets.D2 };
    const dir: DefensiveDirective = {
      type: 'help-and-recover', defenders: ['D2'], target: 'O1',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D2 doit s'être déplacé vers O1 (entre sa position de base et le target)
    const distBefore = Math.hypot(before.x - step.off.O1.x, before.y - step.off.O1.y);
    const distAfter = Math.hypot(targets.D2.x - step.off.O1.x, targets.D2.y - step.off.O1.y);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("release : helper retourne sur son homme", () => {
    const step = baseStep();
    const targets = baseDef();
    step.assignmentOverrides = { D2: 'O2' };
    const dir: DefensiveDirective = {
      type: 'help-and-recover', defenders: ['D2'], target: 'O1',
      phase: 'release', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D2 doit être proche de O2 (son homme assigné)
    const distToMan = Math.hypot(targets.D2.x - step.off.O2.x, targets.D2.y - step.off.O2.y);
    expect(distToMan).toBeLessThan(50);
  });
});

describe('applyDirective — pre-switch', () => {
  it("repositionne les défenseurs sur leur nouveau homme via assignmentOverrides", () => {
    const step = baseStep();
    const targets = baseDef();
    step.assignmentOverrides = { D1: 'O5', D5: 'O1' };
    const dir: DefensiveDirective = {
      type: 'pre-switch', defenders: ['D1'], swapWith: 'D5',
      phase: 'engage', sourceActionId: 'd1',
    };
    applyDirective(targets, dir, step);
    // D1 doit être proche de O5 (son nouveau homme), D5 proche de O1
    const d1ToO5 = Math.hypot(targets.D1.x - step.off.O5.x, targets.D1.y - step.off.O5.y);
    const d5ToO1 = Math.hypot(targets.D5.x - step.off.O1.x, targets.D5.y - step.off.O1.y);
    expect(d1ToO5).toBeLessThan(50);
    expect(d5ToO1).toBeLessThan(50);
  });
});
