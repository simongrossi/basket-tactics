import { describe, expect, it } from 'vitest';
import { PX_PER_M } from '@/lib/data/court';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { loadTemplate } from '@/lib/state/transforms/coreTransforms';
import { fullStepToSeconds } from '@/lib/logic/timecode';
import { resolveTimelineFrame } from '../frameResolver';
import {
  DEFENDER_ACCEL_MPS2,
  DEFENDER_BACKPEDAL_MAX_MPS,
  DEFENDER_FORWARD_MAX_MPS,
  DEFENDER_LATERAL_MAX_MPS,
  DEFENDER_SPRINT_MAX_MPS,
  defenderSpeedCapMps,
  kinematicMaxStepPx,
  restToRestProgress,
} from '../kinematicLimits';

describe('kinematicMaxStepPx', () => {
  const dt = 1 / 30;
  it('départ arrêté : la vitesse ne croît que de a·dt', () => {
    const step = kinematicMaxStepPx({
      prev: { x: 0, y: 0 }, target: { x: 200, y: 0 }, dtSec: dt,
      maxSpeedMps: 7, accelMps2: DEFENDER_ACCEL_MPS2,
    });
    expect(step / dt / PX_PER_M).toBeCloseTo(DEFENDER_ACCEL_MPS2 * dt, 5);
  });

  it('plafonne à la vitesse maximale du mode', () => {
    const step = kinematicMaxStepPx({
      prev: { x: 0, y: 0 }, target: { x: 400, y: 0 }, dtSec: dt,
      memory: { speedPxPerSec: 10 * PX_PER_M }, maxSpeedMps: 4, accelMps2: 6,
    });
    expect(step / dt / PX_PER_M).toBeCloseTo(4, 5);
  });

  it('freinage anticipé : près d’une place immobile, la vitesse tombe vers 0', () => {
    const memory = { speedPxPerSec: 6 * PX_PER_M, target: { x: 2, y: 0 } };
    const near = kinematicMaxStepPx({
      prev: { x: 0, y: 0 }, target: { x: 2, y: 0 }, dtSec: dt, memory, maxSpeedMps: 7, accelMps2: 6,
    });
    expect(near / dt / PX_PER_M).toBeLessThan(2.1);
  });
});

describe('defenderSpeedCapMps', () => {
  // Corps orienté vers le haut (0°) ; headingDeg(dx, dy) = atan2(dx, -dy).
  const cap = (dx: number, dy: number, extra: Partial<Parameters<typeof defenderSpeedCapMps>[0]> = {}) =>
    defenderSpeedCapMps({ moveDx: dx, moveDy: dy, bodyDeg: 0, gapPx: 5, sprint: false, ...extra });
  it('face, pas chassé, reculons', () => {
    expect(cap(0, -10)).toBe(DEFENDER_FORWARD_MAX_MPS);
    expect(cap(10, 0)).toBe(DEFENDER_LATERAL_MAX_MPS);
    expect(cap(0, 10)).toBe(DEFENDER_BACKPEDAL_MAX_MPS);
  });
  it('sprint (repli, closeout, rotation) et « turn and run » en retard', () => {
    expect(cap(0, -10, { sprint: true })).toBe(DEFENDER_SPRINT_MAX_MPS);
    expect(cap(10, 0, { gapPx: 2 * PX_PER_M })).toBe(DEFENDER_FORWARD_MAX_MPS);
  });
});

describe('restToRestProgress', () => {
  const base = { distM: 4, durationSec: 2, accelMps2: 4 };
  it('sans arrêt de part ni d’autre : identité', () => {
    expect(restToRestProgress({ ...base, localT: 0.3, startsFromRest: false, stopsAtEnd: false })).toBe(0.3);
  });
  it('monotone, borné, bornes respectées', () => {
    let last = 0;
    for (let i = 0; i <= 100; i++) {
      const p = restToRestProgress({ ...base, localT: i / 100, startsFromRest: true, stopsAtEnd: true });
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      last = p;
    }
    expect(restToRestProgress({ ...base, localT: 0, startsFromRest: true, stopsAtEnd: true })).toBe(0);
    expect(restToRestProgress({ ...base, localT: 1, startsFromRest: true, stopsAtEnd: true })).toBeCloseTo(1, 9);
  });
  it('départ arrêté : vitesse initiale nulle, accélération ≤ a quand la durée le permet', () => {
    const n = 400;
    const pos = (i: number) => base.distM * restToRestProgress({
      ...base, localT: i / n, startsFromRest: true, stopsAtEnd: true,
    });
    const dt = base.durationSec / n;
    for (let i = 1; i < n; i++) {
      const acc = (pos(i + 1) - 2 * pos(i) + pos(i - 1)) / (dt * dt);
      expect(Math.abs(acc)).toBeLessThanOrEqual(base.accelMps2 + 1e-6);
    }
    expect((pos(1) - pos(0)) / dt).toBeLessThan(0.05);
  });
});

describe('cinématique physique en lecture (profil réaliste)', () => {
  it('pnr-central : départs progressifs des défenseurs aux changements d’étape', () => {
    const tpl = TEMPLATES.find((t) => t.id === 'pnr-central')!;
    const state = loadTemplate({ ...makeInitialState(), realismProfile: 'realistic' }, tpl);
    const last = state.steps.length - 1;
    for (let k = 1; k < last; k++) {
      // Premier sous-pas après la borne : gain de vitesse ≤ a·dt (+ marge de
      // contact du solveur de collisions).
      const f0 = resolveTimelineFrame(state, k - 1 / 60)!;
      const f1 = resolveTimelineFrame(state, k)!;
      const f2 = resolveTimelineFrame(state, k + 1 / 60)!;
      const dt = fullStepToSeconds(state, k + 1 / 60) - fullStepToSeconds(state, k);
      for (const id of Object.keys(f1.defPos) as (keyof typeof f1.defPos)[]) {
        const v1 = Math.hypot(f1.defPos[id].x - f0.defPos[id].x, f1.defPos[id].y - f0.defPos[id].y) / dt;
        const v2 = Math.hypot(f2.defPos[id].x - f1.defPos[id].x, f2.defPos[id].y - f1.defPos[id].y) / dt;
        expect((v2 - v1) / PX_PER_M, `${id} à l’étape ${k}`)
          .toBeLessThanOrEqual(DEFENDER_ACCEL_MPS2 * dt + 0.5 / PX_PER_M / dt + 1e-6);
      }
    }
  });

  it('aucun défenseur au-delà du sprint en m/s, toute la bibliothèque', () => {
    for (const tpl of TEMPLATES) {
      const state = loadTemplate({ ...makeInitialState(), realismProfile: 'realistic' }, tpl);
      if (state.steps.length < 2) continue;
      let prev = resolveTimelineFrame(state, 0)!;
      for (let tick = 1; tick <= (state.steps.length - 1) * 60; tick++) {
        const f = resolveTimelineFrame(state, tick / 60)!;
        const dt = fullStepToSeconds(state, tick / 60) - fullStepToSeconds(state, (tick - 1) / 60);
        for (const id of Object.keys(f.defPos) as (keyof typeof f.defPos)[]) {
          const v = Math.hypot(f.defPos[id].x - prev.defPos[id].x, f.defPos[id].y - prev.defPos[id].y) / dt / PX_PER_M;
          // Sprint + marge de contact (bousculé par le solveur de collisions).
          expect(v, `${tpl.id} ${id} t=${tick / 60}`).toBeLessThanOrEqual(DEFENDER_SPRINT_MAX_MPS + 2.5 / PX_PER_M / dt);
        }
        prev = f;
      }
    }
  }, 120_000);
});
