import { describe, expect, it } from 'vitest';
import { avoidAttackerRoute } from '../attackerRouteAvoidance';
import { samplePolyline } from '../../polyline';
import { attackerTrajectoryAt } from '../../playbackTrajectory';
import { resolveFrameAt } from '../frameResolver';
import { makeInitialState } from '@/lib/data/initial';
import type { Annotation, AppState } from '@/lib/types';

function scenario(type: 'cut' | 'dribble', cvt = false): AppState {
  const base = makeInitialState();
  const from = { x: 80, y: 430 };
  const to = { x: 520, y: 430 };
  const off = { O1: from, O2: { x: 80, y: 80 }, O3: { x: 520, y: 80 },
    O4: { x: 300, y: 150 }, O5: { x: 300, y: 430 } };
  const defense = { D1: { x: 80, y: 200 }, D2: { x: 180, y: 200 },
    D3: { x: 420, y: 200 }, D4: { x: 520, y: 200 }, D5: { x: 300, y: 260 } };
  const annotation: Annotation = { type, fromId: 'O1', toId: null, from, to, tStart: 0.3, tEnd: 0.8 };
  return { ...base, cvtOffensiveEnabled: cvt, defenseInitial: defense,
    steps: [
      { off, ballCarrier: 'O1', annotations: [annotation], defenseOverrides: defense },
      { off: { ...off, O1: to }, ballCarrier: 'O1', annotations: [], defenseOverrides: defense },
    ] };
}

describe('évitement fidèle à l’action', () => {
  for (const type of ['cut', 'dribble'] as const) {
    for (const cvt of [false, true]) {
      it(`${type} : attend le départ et reste arrivé, CVT=${cvt}`, () => {
        const state = scenario(type, cvt);
        expect(resolveFrameAt(state, 0.2)!.off.O1).toEqual(state.steps[0].off.O1);
        expect(resolveFrameAt(state, 0.9)!.off.O1).toEqual(state.steps[1].off.O1);
        const mid = resolveFrameAt(state, 0.55)!.off.O1;
        expect(Math.hypot(mid.x - 300, mid.y - 430)).toBeGreaterThanOrEqual(33.9);
      });
    }
  }

  it('ne remplace pas un détour dessiné par une courbe directe entre étapes', () => {
    const state = scenario('dribble');
    state.steps[0].annotations[0].waypoints = [{ x: 300, y: 340 }];
    const frame = resolveFrameAt(state, 0.55)!;
    expect(frame.off.O1.x).toBeCloseTo(300, 5);
    expect(frame.off.O1.y).toBeCloseTo(340, 5);
  });

  it('conserve un chemin déjà libre, même si sa corde traverse un obstacle', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }];
    const obstacle = [{ center: { x: 100, y: 0 }, radius: 34 }];
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const p = samplePolyline(path, t);
      expect(avoidAttackerRoute(p, path, t, obstacle)).toEqual(p);
    }
  });

  it('déforme la portion bloquée sans supprimer le point de passage ni la portion suivante', () => {
    const path = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }];
    const obs = [{ center: { x: 100, y: 0 }, radius: 34 }];
    const mid = avoidAttackerRoute(samplePolyline(path, 0.25), path, 0.25, obs);
    expect(Math.abs(mid.y)).toBeGreaterThanOrEqual(34);
    for (const t of [0, 0.5, 0.75, 1]) {
      const p = samplePolyline(path, t);
      expect(avoidAttackerRoute(p, path, t, obs)).toEqual(p);
    }
  });

  it('contourne aussi un obstacle sur le débord d’une spline, hors de sa corde', () => {
    const path = [{ x: 50, y: 200 }, { x: 250, y: 200 }, { x: 250, y: 600 }];
    const progress = 1 / 6;
    const center = samplePolyline(path, progress);
    expect(Math.abs(center.y - 200)).toBeGreaterThan(34);
    const moved = avoidAttackerRoute(center, path, progress, [{ center, radius: 34 }]);
    expect(Math.hypot(moved.x - center.x, moved.y - center.y)).toBeGreaterThanOrEqual(34);
    const waypoint = samplePolyline(path, 1 / 3);
    expect(avoidAttackerRoute(waypoint, path, 1 / 3, [{ center, radius: 34 }])).toEqual(waypoint);
  });

  it('transmet la progression réelle après un sprint et un timing absolu', () => {
    const state = scenario('cut');
    Object.assign(state.steps[0].annotations[0], { tStartAbs: 1, tEndAbs: 3, sprint: true });
    const before = attackerTrajectoryAt(state.steps, 0, 'O1', 0.2, () => 4);
    const after = attackerTrajectoryAt(state.steps, 0, 'O1', 0.6, () => 4);
    expect(before.route?.progress).toBe(0);
    expect(after.route?.progress).toBe(1);
  });
});
