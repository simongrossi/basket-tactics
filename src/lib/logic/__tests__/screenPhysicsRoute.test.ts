import { describe, expect, it } from 'vitest';
import type { DetectedOffBallScreen, Point } from '@/lib/types';
import { carrierScreenRoutePreference, offBallScreenRoutePreference } from '../screenPhysics';

function baseScreen(overrides: Partial<DetectedOffBallScreen> = {}): DetectedOffBallScreen {
  return {
    type: 'pindown',
    screener: 'O4',
    screenerDef: 'D4',
    cutter: 'O2',
    cutterDef: 'D2',
    screenerPos: { x: 300, y: 360 },
    cutterPos: { x: 300, y: 420 },
    ...overrides,
  };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

describe('offBallScreenRoutePreference', () => {
  it('route un backscreen côté panier plutôt que comme un pindown générique', () => {
    const screen = baseScreen({
      type: 'backscreen',
      screenerPos: { x: 320, y: 260 },
      cutterPos: { x: 320, y: 330 },
    });
    const hoop = { x: 300, y: 75 };
    const route = offBallScreenRoutePreference(screen, 'chase', { x: 500, y: 300 }, hoop);

    expect(route).toBeTruthy();
    expect(dot(route!, unit({ x: hoop.x - screen.screenerPos.x, y: hoop.y - screen.screenerPos.y })))
      .toBeGreaterThan(0.99);
  });

  it('route un flare chase côté ballon et under côté opposé', () => {
    const screen = baseScreen({
      type: 'flare',
      screenerPos: { x: 300, y: 360 },
      cutterPos: { x: 380, y: 360 },
    });
    const ball = { x: 260, y: 320 };
    const toBall = unit({ x: ball.x - screen.cutterPos.x, y: ball.y - screen.cutterPos.y });

    const chase = offBallScreenRoutePreference(screen, 'chase', ball);
    const under = offBallScreenRoutePreference(screen, 'under', ball);

    expect(dot(chase!, toBall)).toBeGreaterThan(0.99);
    expect(dot(under!, toBall)).toBeLessThan(-0.99);
  });

  it('force un elevator vers le gap entre les deux poseurs', () => {
    const screen = baseScreen({
      type: 'elevator',
      screenerPos: { x: 280, y: 360 },
      secondScreener: 'O5',
      secondScreenerDef: 'D5',
      secondScreenerPos: { x: 320, y: 360 },
    });
    const route = offBallScreenRoutePreference(screen, 'over', { x: 300, y: 470 });

    expect(route).toEqual({ x: 1, y: 0 });
  });

  it('laisse switch et bump sans route de contournement forcée', () => {
    expect(offBallScreenRoutePreference(baseScreen(), 'switch', { x: 300, y: 470 }))
      .toBeNull();
    expect(offBallScreenRoutePreference(baseScreen(), 'bump', { x: 300, y: 470 }))
      .toBeNull();
  });
});

// P1.2 — garde-fous du contrat carrierScreenRoutePreference : le côté de
// contournement du défenseur du porteur DOIT suivre la règle défensive
// (under → côté panier, over/hedge/drop → côté opposé au panier, ice →
// côté opposé au porteur, switch → pas de route). Comportement déjà câblé
// dans frameResolver ; ces tests le verrouillent unitairement.
describe('carrierScreenRoutePreference — côté selon la règle (P1.2)', () => {
  const hoop = { x: 300, y: 75 };
  const off = {
    O1: { x: 340, y: 360 }, // porteur, côté droit du poseur
    O2: { x: 100, y: 300 },
    O3: { x: 500, y: 300 },
    O4: { x: 150, y: 150 },
    O5: { x: 300, y: 330 }, // poseur
  } as const;
  const screen = {
    screener: 'O5',
    screenerDef: 'D5',
    carrier: 'O1',
    carrierDef: 'D1',
    screenerPos: off.O5,
  } as const;
  const toHoop = unit({ x: hoop.x - off.O5.x, y: hoop.y - off.O5.y });

  it('under et weak → route côté panier', () => {
    for (const rule of ['under', 'weak'] as const) {
      const route = carrierScreenRoutePreference(rule, screen, off, hoop);
      expect(route, rule).not.toBeNull();
      expect(dot(route!, toHoop), rule).toBeGreaterThan(0.9);
    }
  });

  it('over, hedge, drop, blitz, peel-switch → route côté opposé au panier', () => {
    for (const rule of ['over', 'hedge', 'drop', 'blitz', 'peel-switch'] as const) {
      const route = carrierScreenRoutePreference(rule, screen, off, hoop);
      expect(route, rule).not.toBeNull();
      expect(dot(route!, toHoop), rule).toBeLessThan(-0.9);
    }
  });

  it('ice → route du côté opposé au porteur (ferme le côté du ballon)', () => {
    const route = carrierScreenRoutePreference('ice', screen, off, hoop);
    expect(route).not.toBeNull();
    // Le porteur est côté +perp du poseur ; la route ice doit pointer -perp.
    const perp = { x: -toHoop.y, y: toHoop.x };
    const sToC = unit({ x: off.O1.x - off.O5.x, y: off.O1.y - off.O5.y });
    const carrierSide = Math.sign(dot(sToC, perp));
    expect(Math.sign(dot(route!, perp))).toBe(-carrierSide);
  });

  it('switch → pas de route de contournement (swap de matchups)', () => {
    expect(carrierScreenRoutePreference('switch', screen, off, hoop)).toBeNull();
  });
});
