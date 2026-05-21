// Tests K.7 V2 — Correction (clamping) des téléportations + vitesses aberrantes.

import { describe, expect, it } from 'vitest';
import {
  clampTeleports,
  clampAberrantSpeed,
  detectTeleport,
  detectAberrantSpeed,
  TELEPORT_THRESHOLD_PX,
  type FrameSnapshot,
} from '@/lib/logic/anomaly/anomalyDetector';
import type { DefenderRules } from '@/lib/types';

function snap(stepIdx: number, off: Record<string, [number, number]>, def: Record<string, [number, number]>): FrameSnapshot {
  return {
    stepIdx,
    off: Object.fromEntries(Object.entries(off).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['off'],
    defPos: Object.fromEntries(Object.entries(def).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['defPos'],
  };
}

const BASE_OFF = { O1: [100, 100], O2: [200, 100], O3: [300, 100], O4: [400, 100], O5: [500, 100] } as Record<string, [number, number]>;
const BASE_DEF = { D1: [100, 200], D2: [200, 200], D3: [300, 200], D4: [400, 200], D5: [500, 200] } as Record<string, [number, number]>;
const EMPTY_RULES: DefenderRules = { D1: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D2: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D3: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D4: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D5: { helpPct: 0, priority: 'man', vsCarrier: 'coller' } };

describe('K.7 V2 — clampTeleports', () => {
  it('aucun changement si aucune position ne saute', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, { ...BASE_OFF, O1: [110, 100] }, BASE_DEF);
    const clamped = clampTeleports(a, b);
    expect(clamped.off.O1).toEqual({ x: 110, y: 100 });
  });

  it('clampe un attaquant qui sautait > seuil', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    // O1 voulait sauter de 100 px, on clampe à 24 px (seuil default)
    const b = snap(1, { ...BASE_OFF, O1: [200, 100] }, BASE_DEF);
    const clamped = clampTeleports(a, b);
    expect(clamped.off.O1.x).toBeCloseTo(124, 1); // 100 + 24
    expect(clamped.off.O1.y).toBeCloseTo(100, 5);
  });

  it('clampe un défenseur qui sautait', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, BASE_OFF, { ...BASE_DEF, D3: [400, 300] }); // dx=100 dy=100, d≈141
    const clamped = clampTeleports(a, b);
    // 24 / 141 ≈ 0.170 → (300 + 100*0.170, 200 + 100*0.170) = (317, 217)
    expect(clamped.defPos.D3.x).toBeCloseTo(316.97, 1);
    expect(clamped.defPos.D3.y).toBeCloseTo(216.97, 1);
  });

  it('utilise le maxStep custom', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, { ...BASE_OFF, O1: [200, 100] }, BASE_DEF);
    const clamped = clampTeleports(a, b, 50);
    expect(clamped.off.O1.x).toBeCloseTo(150, 5);
  });

  it('après clamp, detectTeleport ne flag plus rien', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, { ...BASE_OFF, O1: [200, 100] }, { ...BASE_DEF, D3: [400, 300] });
    expect(detectTeleport(a, b).length).toBeGreaterThan(0);
    const clamped = clampTeleports(a, b);
    // Marge de bruit numérique 0.01 px → seuil 24.5
    expect(detectTeleport(a, clamped, TELEPORT_THRESHOLD_PX + 0.5).length).toBe(0);
  });

  it('immutable : ne mute pas cur', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, { ...BASE_OFF, O1: [200, 100] }, BASE_DEF);
    const orig = b.off.O1;
    clampTeleports(a, b);
    expect(b.off.O1).toBe(orig); // référence préservée
    expect(b.off.O1.x).toBe(200);
  });
});

describe('K.7 V2 — clampAberrantSpeed', () => {
  const GLOBAL_MAX = 100;

  it('aucun changement si tous restent sous limite', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, BASE_OFF, { ...BASE_DEF, D1: [180, 200] }); // 80 px
    const clamped = clampAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(clamped.defPos.D1).toEqual({ x: 180, y: 200 });
  });

  it('clampe un défenseur trop rapide à maxSpeed × 1.95', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    // D1 voulait sauter de 400 px → limite = 195
    const b = snap(1, BASE_OFF, { ...BASE_DEF, D1: [500, 200] });
    const clamped = clampAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(clamped.defPos.D1.x).toBeCloseTo(295, 1); // 100 + 195
  });

  it('respecte rule.maxSpeed individuel', () => {
    const rules: DefenderRules = { ...EMPTY_RULES, D1: { helpPct: 0, priority: 'man', vsCarrier: 'coller', maxSpeed: 50 } };
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, BASE_OFF, { ...BASE_DEF, D1: [400, 200] }); // 300 px
    // limite = 50 × 1.95 = 97.5
    const clamped = clampAberrantSpeed(a, b, GLOBAL_MAX, rules);
    expect(clamped.defPos.D1.x).toBeCloseTo(197.5, 1);
  });

  it('après clamp, detectAberrantSpeed ne flag plus rien', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, BASE_OFF, { ...BASE_DEF, D1: [500, 200] });
    expect(detectAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES).length).toBeGreaterThan(0);
    const clamped = clampAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(detectAberrantSpeed(a, clamped, GLOBAL_MAX, EMPTY_RULES).length).toBe(0);
  });

  it('ne touche pas off (uniquement défenseurs)', () => {
    const a = snap(0, BASE_OFF, BASE_DEF);
    const b = snap(1, { ...BASE_OFF, O1: [9999, 9999] }, BASE_DEF);
    const clamped = clampAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(clamped.off.O1).toEqual({ x: 9999, y: 9999 });
  });
});
