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

// =============================================================
// Phase 5 — couvertures Tier 2
// =============================================================

describe('applyDirective — Phase 5 Tier 2 coverages', () => {
  it('chaque type produit des positions finies pour ses défenseurs', () => {
    const tier2: Array<DefensiveDirective['type']> = [
      'over','under','switch','hedge','drop','blitz','ice',
      'flat-hedge','peel-switch','triple-switch','closing-out',
    ];
    for (const type of tier2) {
      const step = baseStep();
      const targets = baseDef();
      const dir: DefensiveDirective = {
        type,
        defenders: ['D1'],
        target: 'O1',
        swapWith: 'D5',
        thirdSwap: 'D3',
        phase: 'engage',
        sourceActionId: `d-${type}`,
      };
      applyDirective(targets, dir, step);
      for (const id of ['D1','D2','D3','D4','D5'] as const) {
        const p = targets[id];
        expect(Number.isFinite(p.x), `${type}: ${id}.x non fini`).toBe(true);
        expect(Number.isFinite(p.y), `${type}: ${id}.y non fini`).toBe(true);
      }
    }
  });

  it('drop deep place le défenseur plus près du panier que drop shallow', () => {
    const step = baseStep();
    const t1 = baseDef();
    const t2 = baseDef();
    applyDirective(t1, {
      type: 'drop', defenders: ['D5'], target: 'O1',
      dropDepth: 'shallow', phase: 'engage', sourceActionId: 'a',
    }, step);
    applyDirective(t2, {
      type: 'drop', defenders: ['D5'], target: 'O1',
      dropDepth: 'deep', phase: 'engage', sourceActionId: 'a',
    }, step);
    const dShallow = Math.hypot(t1.D5.x - 300, t1.D5.y - 75);
    const dDeep = Math.hypot(t2.D5.x - 300, t2.D5.y - 75);
    expect(dDeep).toBeLessThan(dShallow);
  });

  it('switch : D1 et D5 prennent le man de l\'autre', () => {
    const step = baseStep();
    const targets = baseDef();
    applyDirective(targets, {
      type: 'switch', defenders: ['D1'], swapWith: 'D5',
      phase: 'engage', sourceActionId: 'a',
    }, step);
    const d1ToO5 = Math.hypot(targets.D1.x - step.off.O5.x, targets.D1.y - step.off.O5.y);
    const d5ToO1 = Math.hypot(targets.D5.x - step.off.O1.x, targets.D5.y - step.off.O1.y);
    expect(d1ToO5).toBeLessThan(50);
    expect(d5ToO1).toBeLessThan(50);
  });

  it('triple-switch : D1→man(D5), D5→man(D3), D3→man(D1)', () => {
    const step = baseStep();
    const targets = baseDef();
    applyDirective(targets, {
      type: 'triple-switch', defenders: ['D1'], swapWith: 'D5', thirdSwap: 'D3',
      phase: 'engage', sourceActionId: 'a',
    }, step);
    expect(Math.hypot(targets.D1.x - step.off.O5.x, targets.D1.y - step.off.O5.y)).toBeLessThan(50);
    expect(Math.hypot(targets.D5.x - step.off.O3.x, targets.D5.y - step.off.O3.y)).toBeLessThan(50);
    expect(Math.hypot(targets.D3.x - step.off.O1.x, targets.D3.y - step.off.O1.y)).toBeLessThan(50);
  });

  it('closing-out : défenseur proche du target côté périphérie', () => {
    const step = baseStep();
    const targets = baseDef();
    applyDirective(targets, {
      type: 'closing-out', defenders: ['D2'], target: 'O2',
      phase: 'engage', sourceActionId: 'a',
    }, step);
    const d = Math.hypot(targets.D2.x - step.off.O2.x, targets.D2.y - step.off.O2.y);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(40);
  });
});
