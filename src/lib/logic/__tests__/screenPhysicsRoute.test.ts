import { describe, expect, it } from 'vitest';
import type { DetectedOffBallScreen, Point } from '@/lib/types';
import { offBallScreenRoutePreference } from '../screenPhysics';

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
