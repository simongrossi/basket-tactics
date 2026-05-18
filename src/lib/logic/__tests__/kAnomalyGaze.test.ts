// Tests K.5 — Détection regard anormal (pure).

import { describe, expect, it } from 'vitest';
import {
  detectAnomalousGaze,
  circularDeltaDeg,
  GAZE_MAX_DELTA_DEG,
} from '@/lib/logic/anomaly/anomalyDetector';

describe('K.5 — circularDeltaDeg', () => {
  it('renvoie 0 quand les angles sont égaux', () => {
    expect(circularDeltaDeg(90, 90)).toBe(0);
  });

  it('gère le wrap-around 360°', () => {
    expect(circularDeltaDeg(10, 350)).toBe(20);
    expect(circularDeltaDeg(350, 10)).toBe(-20);
  });

  it('renvoie un delta dans [-180, 180]', () => {
    expect(Math.abs(circularDeltaDeg(180, 0))).toBe(180);
    expect(circularDeltaDeg(90, 0)).toBe(90);
    expect(circularDeltaDeg(0, 90)).toBe(-90);
  });
});

describe('K.5 — détection regard anormal', () => {
  it('aucun flag quand regard aligné avec corps', () => {
    const reports = detectAnomalousGaze(
      [{ id: 'D1', body: 0, gaze: 0 }, { id: 'D2', body: 90, gaze: 90 }],
      0,
    );
    expect(reports).toEqual([]);
  });

  it('aucun flag pour un écart sous le seuil 90°', () => {
    const reports = detectAnomalousGaze(
      [{ id: 'D1', body: 0, gaze: 60 }, { id: 'D2', body: 0, gaze: -60 }],
      0,
    );
    expect(reports).toEqual([]);
  });

  it('flag warning entre 90° et 135°', () => {
    const reports = detectAnomalousGaze(
      [{ id: 'D1', body: 0, gaze: 100 }],
      0,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].kind).toBe('gaze-out-of-range');
    expect(reports[0].severity).toBe('warning');
  });

  it('flag critical au-delà de 135° (regard derrière la tête)', () => {
    const reports = detectAnomalousGaze(
      [{ id: 'O1', body: 0, gaze: 170 }],
      3,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].playerId).toBe('O1');
    expect(reports[0].severity).toBe('critical');
    expect(reports[0].stepIdx).toBe(3);
  });

  it('respecte un seuil custom', () => {
    const reports = detectAnomalousGaze(
      [{ id: 'D1', body: 0, gaze: 70 }],
      0,
      60, // seuil custom strict
    );
    expect(reports).toHaveLength(1);
  });

  it('expose la constante CLAUDE.md', () => {
    expect(GAZE_MAX_DELTA_DEG).toBe(90);
  });

  it('flag plusieurs joueurs en une passe', () => {
    const reports = detectAnomalousGaze(
      [
        { id: 'D1', body: 0, gaze: 100 },
        { id: 'D2', body: 0, gaze: 50 }, // OK
        { id: 'D3', body: 180, gaze: 0 }, // 180° → critical
      ],
      0,
    );
    expect(reports).toHaveLength(2);
    expect(reports.map((r) => r.playerId).sort()).toEqual(['D1', 'D3']);
  });
});
