// Tests K.4 — Détection flicker/oscillation (pure).

import { describe, expect, it } from 'vitest';
import { detectFlicker, FLICKER_MIN_VELOCITY_PX } from '@/lib/logic/anomaly/anomalyDetector';
import type { FrameSnapshot } from '@/lib/logic/anomaly/anomalyDetector';

function snap(stepIdx: number, off: Record<string, [number, number]>, def: Record<string, [number, number]>): FrameSnapshot {
  return {
    stepIdx,
    off: Object.fromEntries(Object.entries(off).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['off'],
    defPos: Object.fromEntries(Object.entries(def).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['defPos'],
  };
}

const STATIC_OFF = { O1: [100, 100], O2: [200, 100], O3: [300, 100], O4: [400, 100], O5: [500, 100] } as Record<string, [number, number]>;
const STATIC_DEF = { D1: [100, 200], D2: [200, 200], D3: [300, 200], D4: [400, 200], D5: [500, 200] } as Record<string, [number, number]>;

describe('K.4 — détection flicker / oscillation', () => {
  it('aucun flag pour 3 frames identiques (joueurs statiques)', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    const b = snap(1, STATIC_OFF, STATIC_DEF);
    const c = snap(2, STATIC_OFF, STATIC_DEF);
    expect(detectFlicker(a, b, c)).toEqual([]);
  });

  it('aucun flag pour un déplacement linéaire (cos proche de 1)', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    const b = snap(1, { ...STATIC_OFF, O1: [120, 100] }, STATIC_DEF);
    const c = snap(2, { ...STATIC_OFF, O1: [140, 100] }, STATIC_DEF);
    expect(detectFlicker(a, b, c)).toEqual([]);
  });

  it('aucun flag pour un virage doux (cos > seuil -0.707)', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    // O1 avance droit, puis virage 60° → cos = cos(60°) = 0.5
    const b = snap(1, { ...STATIC_OFF, O1: [120, 100] }, STATIC_DEF);
    const c = snap(2, { ...STATIC_OFF, O1: [130, 117] }, STATIC_DEF); // dir ~ (10, 17) / 60°
    expect(detectFlicker(a, b, c)).toEqual([]);
  });

  it('flag une oscillation parfaite (180° flip)', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    // O1 avance de 20px puis revient en arrière de 20px
    const b = snap(1, { ...STATIC_OFF, O1: [120, 100] }, STATIC_DEF);
    const c = snap(2, { ...STATIC_OFF, O1: [100, 100] }, STATIC_DEF);
    const reports = detectFlicker(a, b, c);
    expect(reports).toHaveLength(1);
    expect(reports[0].playerId).toBe('O1');
    expect(reports[0].kind).toBe('flicker');
    expect(reports[0].severity).toBe('critical'); // cos ≈ -1
    expect(reports[0].stepIdx).toBe(2);
  });

  it('flag un virage > 135° (cos < -0.707) en warning', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    // O1 avance (10, 0), puis recule diagonalement (-8, 8) → cos ≈ -0.71 (limite)
    const b = snap(1, { ...STATIC_OFF, O1: [110, 100] }, STATIC_DEF);
    const c = snap(2, { ...STATIC_OFF, O1: [98, 112] }, STATIC_DEF);
    const reports = detectFlicker(a, b, c);
    expect(reports).toHaveLength(1);
    expect(reports[0].severity).toBe('warning');
  });

  it('ne flag PAS si la magnitude de vélocité est sous le seuil (joueur quasi-statique)', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    // Bouger de 2 px (< 5) puis -2 → en théorie 180° mais bruit ignoré
    const b = snap(1, { ...STATIC_OFF, O1: [102, 100] }, STATIC_DEF);
    const c = snap(2, { ...STATIC_OFF, O1: [100, 100] }, STATIC_DEF);
    expect(detectFlicker(a, b, c)).toEqual([]);
  });

  it('flag aussi les défenseurs', () => {
    const a = snap(0, STATIC_OFF, STATIC_DEF);
    const b = snap(1, STATIC_OFF, { ...STATIC_DEF, D3: [320, 200] });
    const c = snap(2, STATIC_OFF, { ...STATIC_DEF, D3: [300, 200] });
    const reports = detectFlicker(a, b, c);
    expect(reports.find((r) => r.playerId === 'D3')).toBeDefined();
  });

  it('expose les constantes', () => {
    expect(FLICKER_MIN_VELOCITY_PX).toBeGreaterThan(0);
  });
});
