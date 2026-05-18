// Tests K.0 + K.1 — Détection téléportation (pure).

import { describe, expect, it } from 'vitest';
import {
  detectTeleport,
  TELEPORT_THRESHOLD_PX,
  TELEPORT_CRITICAL_PX,
  type FrameSnapshot,
} from '@/lib/logic/anomaly/anomalyDetector';

function snap(stepIdx: number, off: Record<string, [number, number]>, def: Record<string, [number, number]>): FrameSnapshot {
  return {
    stepIdx,
    off: Object.fromEntries(Object.entries(off).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['off'],
    defPos: Object.fromEntries(Object.entries(def).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['defPos'],
  };
}

const FIVE_OFF = { O1: [100, 100], O2: [200, 100], O3: [300, 100], O4: [400, 100], O5: [500, 100] } as const;
const FIVE_DEF = { D1: [100, 200], D2: [200, 200], D3: [300, 200], D4: [400, 200], D5: [500, 200] } as const;

describe('K.1 — détection téléportation', () => {
  it('aucune anomalie quand les positions ne bougent pas', () => {
    const a = snap(0, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    const b = snap(1, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    expect(detectTeleport(a, b)).toEqual([]);
  });

  it('aucune anomalie pour un déplacement normal (< seuil)', () => {
    const a = snap(0, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    // O1 bouge de 20 px (< seuil 24)
    const b = snap(1, { ...FIVE_OFF, O1: [120, 100] }, FIVE_DEF as Record<string, [number, number]>);
    expect(detectTeleport(a, b)).toEqual([]);
  });

  it('flag un attaquant qui saute > seuil', () => {
    const a = snap(0, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    // O1 saute de 40 px
    const b = snap(1, { ...FIVE_OFF, O1: [140, 100] }, FIVE_DEF as Record<string, [number, number]>);
    const reports = detectTeleport(a, b);
    expect(reports).toHaveLength(1);
    expect(reports[0].kind).toBe('teleport');
    expect(reports[0].playerId).toBe('O1');
    expect(reports[0].severity).toBe('warning');
    expect(reports[0].stepIdx).toBe(1);
    expect(reports[0].value).toBeCloseTo(40, 1);
  });

  it('flag un défenseur qui saute > seuil', () => {
    const a = snap(0, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    const b = snap(1, FIVE_OFF as Record<string, [number, number]>, { ...FIVE_DEF, D3: [350, 250] });
    // d = sqrt(50² + 50²) ≈ 70.7 → critical
    const reports = detectTeleport(a, b);
    expect(reports).toHaveLength(1);
    expect(reports[0].playerId).toBe('D3');
    expect(reports[0].severity).toBe('critical');
  });

  it('classe la sévérité : warning entre [seuil, critique] et critical au-dessus', () => {
    const a = snap(0, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    const b = snap(1, { O1: [130, 100], O2: [280, 100], ...{ O3: [300, 100], O4: [400, 100], O5: [500, 100] } }, FIVE_DEF as Record<string, [number, number]>);
    // O1 : 30 px → warning, O2 : 80 px → critical
    const reports = detectTeleport(a, b);
    expect(reports.find((r) => r.playerId === 'O1')?.severity).toBe('warning');
    expect(reports.find((r) => r.playerId === 'O2')?.severity).toBe('critical');
  });

  it('respecte un seuil custom passé en argument', () => {
    const a = snap(0, FIVE_OFF as Record<string, [number, number]>, FIVE_DEF as Record<string, [number, number]>);
    const b = snap(1, { ...FIVE_OFF, O1: [130, 100] }, FIVE_DEF as Record<string, [number, number]>);
    // Avec seuil 50, le saut de 30 px ne flag plus rien.
    expect(detectTeleport(a, b, 50)).toEqual([]);
    // Avec seuil 10, ça flag.
    expect(detectTeleport(a, b, 10)).toHaveLength(1);
  });

  it('ignore les joueurs absents d\'une des deux frames (jamais de crash)', () => {
    const a = snap(0, { O1: [100, 100] }, FIVE_DEF as Record<string, [number, number]>);
    const b = snap(1, { ...FIVE_OFF, O1: [200, 100] }, FIVE_DEF as Record<string, [number, number]>);
    // O1 saute 100 px → flag. Les autres (absents de `a`) sont ignorés.
    const reports = detectTeleport(a, b);
    expect(reports).toHaveLength(1);
    expect(reports[0].playerId).toBe('O1');
  });

  it('expose les constantes pour rester en sync avec le pipeline', () => {
    expect(TELEPORT_THRESHOLD_PX).toBeGreaterThan(18); // > MAX_DEFENDER_JUMP_PX (clamp visuel)
    expect(TELEPORT_CRITICAL_PX).toBeGreaterThan(TELEPORT_THRESHOLD_PX);
  });
});
