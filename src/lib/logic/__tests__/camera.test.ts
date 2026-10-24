import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  courtToScreen,
  fitCamera,
  panCamera,
  screenToUser,
  viewportMetrics,
  zoomCameraAt,
  type Camera,
} from '../camera';
import type { Point } from '../../types';

const VB_W = 600;
const VB_H = 560;

describe('camera — conversions écran ↔ terrain', () => {
  it('métriques : viewBox 600×560 dans un viewport 600×560 → échelle 1, sans décalage', () => {
    const m = viewportMetrics(600, 560, VB_W, VB_H);
    expect(m.s0).toBe(1);
    expect(m.offsetX).toBe(0);
    expect(m.offsetY).toBe(0);
  });

  it('métriques : viewport large → viewBox centré horizontalement', () => {
    const m = viewportMetrics(1200, 560, VB_W, VB_H);
    expect(m.s0).toBe(1);
    expect(m.offsetX).toBe(300);
    expect(m.offsetY).toBe(0);
  });

  it('screenToUser inverse le centrage', () => {
    const m = viewportMetrics(1200, 560, VB_W, VB_H);
    expect(screenToUser({ x: 300, y: 0 }, m)).toEqual({ x: 0, y: 0 });
    expect(screenToUser({ x: 900, y: 560 }, m)).toEqual({ x: 600, y: 560 });
  });

  it('courtToScreen respecte la caméra', () => {
    const m = viewportMetrics(600, 560, VB_W, VB_H);
    const cam: Camera = { scale: 2, x: -100, y: -50 };
    expect(courtToScreen(cam, { x: 100, y: 100 }, m)).toEqual({ x: 100, y: 150 });
  });
});

describe('camera — zoom ancré', () => {
  it('le point du terrain sous le curseur reste sous le curseur', () => {
    const m = viewportMetrics(800, 600, VB_W, VB_H);
    const cam: Camera = { scale: 1, x: 0, y: 0 };
    const cursor = { x: 123, y: 87 };
    const under = screenToUser(cursor, m);
    const courtPoint: Point = {
      x: (under.x - cam.x) / cam.scale,
      y: (under.y - cam.y) / cam.scale,
    };

    const zoomed = zoomCameraAt(cam, cursor, m, 1.6);
    const after = courtToScreen(zoomed, courtPoint, m);
    expect(after.x).toBeCloseTo(cursor.x, 6);
    expect(after.y).toBeCloseTo(cursor.y, 6);
  });

  it('le point du terrain sous le curseur reste sous le curseur après un pan préalable', () => {
    const m = viewportMetrics(900, 700, VB_W, VB_H);
    const cam = panCamera({ scale: 1.4, x: -20, y: 10 }, 35, -15, m);
    const cursor = { x: 640, y: 220 };
    const under = screenToUser(cursor, m);
    const courtPoint: Point = {
      x: (under.x - cam.x) / cam.scale,
      y: (under.y - cam.y) / cam.scale,
    };

    const zoomed = zoomCameraAt(cam, cursor, m, 0.8);
    const after = courtToScreen(zoomed, courtPoint, m);
    expect(after.x).toBeCloseTo(cursor.x, 6);
    expect(after.y).toBeCloseTo(cursor.y, 6);
  });

  it('borne le zoom entre 0,5 et 5', () => {
    const m = viewportMetrics(600, 560, VB_W, VB_H);
    expect(zoomCameraAt({ scale: 5, x: 0, y: 0 }, { x: 0, y: 0 }, m, 2).scale).toBe(5);
    expect(zoomCameraAt({ scale: 0.5, x: 0, y: 0 }, { x: 0, y: 0 }, m, 0.5).scale).toBe(0.5);
  });
});

describe('camera — pan 1:1 avec le doigt', () => {
  it('un delta de 100 px décale le terrain de 100 px, quel que soit le viewBox', () => {
    const m = viewportMetrics(375, 640, VB_W, VB_H); // téléphone : s0 ≈ 0,625
    const cam: Camera = { scale: 2, x: -50, y: -100 };
    const point: Point = { x: 300, y: 280 };
    const before = courtToScreen(cam, point, m);
    const after = courtToScreen(panCamera(cam, 100, -40, m), point, m);
    expect(after.x - before.x).toBeCloseTo(100, 6);
    expect(after.y - before.y).toBeCloseTo(-40, 6);
  });
});

describe('camera — bornes', () => {
  const winOf = (m: ReturnType<typeof viewportMetrics>) => {
    const winW = m.width / m.s0;
    const winH = m.height / m.s0;
    return { winW, winH, left: (VB_W - winW) / 2, top: (VB_H - winH) / 2 };
  };

  it('au cadrage initial, le terrain reste centré', () => {
    const m = viewportMetrics(1200, 700, VB_W, VB_H);
    const fit = fitCamera(m, VB_W, VB_H);
    expect(fit.scale).toBe(1);
    const topLeft = courtToScreen(fit, { x: 0, y: 0 }, m);
    const bottomRight = courtToScreen(fit, { x: VB_W, y: VB_H }, m);
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(m.width / 2, 6);
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(m.height / 2, 6);
  });

  it('zoomé, le terrain ne peut pas sortir de la fenêtre', () => {
    const m = viewportMetrics(800, 600, VB_W, VB_H);
    const zoomed = zoomCameraAt({ scale: 1, x: 0, y: 0 }, { x: 400, y: 300 }, m, 2);
    const { winW, left } = winOf(m);
    const farLeft = clampCamera({ ...zoomed, x: 9999 }, m, VB_W, VB_H);
    const farRight = clampCamera({ ...zoomed, x: -9999 }, m, VB_W, VB_H);

    expect(farLeft.x).toBeCloseTo(left, 6);
    expect(farRight.x).toBeCloseTo(left + winW - zoomed.scale * VB_W, 6);
    // Les bords du terrain restent hors (ou au bord) de la fenêtre visible.
    expect(courtToScreen(farLeft, { x: 0, y: 0 }, m).x).toBeCloseTo(0, 4);
    expect(courtToScreen(farRight, { x: VB_W, y: 0 }, m).x).toBeCloseTo(m.width, 4);
  });

  it('un pan modéré est conservé, un pan extrême est ramené dans la fenêtre', () => {
    const m = viewportMetrics(800, 600, VB_W, VB_H);
    const zoomed = zoomCameraAt({ scale: 1, x: 0, y: 0 }, { x: 400, y: 300 }, m, 2);
    const { left } = winOf(m);

    const panned = panCamera(zoomed, 10, 0, m);
    expect(clampCamera(panned, m, VB_W, VB_H).x).toBeCloseTo(panned.x, 6);

    const tooFar = clampCamera(panCamera(zoomed, 100000, 0, m), m, VB_W, VB_H);
    expect(tooFar.x).toBeCloseTo(left, 6);
  });
});
