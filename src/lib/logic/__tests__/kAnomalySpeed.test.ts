// Tests K.2 — Détection vitesse aberrante (pure).

import { describe, expect, it } from 'vitest';
import {
  detectAberrantSpeed,
  ABERRANT_SPEED_TOLERANCE,
  type FrameSnapshot,
} from '@/lib/logic/anomaly/anomalyDetector';
import type { DefenderRules } from '@/lib/types';

const EMPTY_RULES: DefenderRules = {
  D1: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D2: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D3: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D4: { helpPct: 0, priority: 'man', vsCarrier: 'coller' }, D5: { helpPct: 0, priority: 'man', vsCarrier: 'coller' },
};

function snap(stepIdx: number, def: Record<string, [number, number]>): FrameSnapshot {
  return {
    stepIdx,
    off: {} as FrameSnapshot['off'],
    defPos: Object.fromEntries(Object.entries(def).map(([k, [x, y]]) => [k, { x, y }])) as FrameSnapshot['defPos'],
  };
}

const BASE = { D1: [100, 200], D2: [200, 200], D3: [300, 200], D4: [400, 200], D5: [500, 200] } as Record<string, [number, number]>;
const GLOBAL_MAX = 100;

describe('K.2 — détection vitesse aberrante', () => {
  it('aucun flag quand tous restent sous maxSpeed × (1 + tol)', () => {
    const a = snap(0, BASE);
    // D1 se déplace de 100 px = exactement maxSpeed → OK (sous tolérance ×1.95)
    const b = snap(1, { ...BASE, D1: [200, 200] });
    expect(detectAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES)).toEqual([]);
  });

  it('flag un défenseur qui dépasse maxSpeed × (1 + tol)', () => {
    const a = snap(0, BASE);
    // D1 se déplace de 220 px > 100 × 1.95 = 195
    const b = snap(1, { ...BASE, D1: [320, 200] });
    const reports = detectAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(reports).toHaveLength(1);
    expect(reports[0].kind).toBe('aberrant-speed');
    expect(reports[0].playerId).toBe('D1');
    expect(reports[0].severity).toBe('warning');
  });

  it('respecte rule.maxSpeed individuel (override global)', () => {
    const rules: DefenderRules = { ...EMPTY_RULES, D1: { helpPct: 0, priority: 'man', vsCarrier: 'coller', maxSpeed: 50 } };
    const a = snap(0, BASE);
    // D1 (maxSpeed=50, limite ~97.5) saute de 110 → flag
    const b = snap(1, { ...BASE, D1: [210, 200] });
    const reports = detectAberrantSpeed(a, b, GLOBAL_MAX, rules);
    expect(reports.find((r) => r.playerId === 'D1')).toBeDefined();
    // Même saut chez D2 (maxSpeed global 100) → OK car 110 < 195
    expect(reports.find((r) => r.playerId === 'D2')).toBeUndefined();
  });

  it('severity critical au-delà du ratio ×3', () => {
    const a = snap(0, BASE);
    // D1 saute de 350 px (ratio 3.5x maxSpeed=100)
    const b = snap(1, { ...BASE, D1: [450, 200] });
    const reports = detectAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(reports[0].severity).toBe('critical');
  });

  it('value et threshold cohérents dans le report', () => {
    const a = snap(0, BASE);
    const b = snap(1, { ...BASE, D1: [330, 200] });
    const reports = detectAberrantSpeed(a, b, GLOBAL_MAX, EMPTY_RULES);
    expect(reports[0].value).toBeCloseTo(230, 1);
    expect(reports[0].threshold).toBeCloseTo(GLOBAL_MAX * (1 + ABERRANT_SPEED_TOLERANCE), 5);
  });

  it('ignore les défenseurs avec maxSpeed ≤ 0 (skip silencieux)', () => {
    const rules: DefenderRules = { ...EMPTY_RULES, D1: { helpPct: 0, priority: 'man', vsCarrier: 'coller', maxSpeed: 0 } };
    const a = snap(0, BASE);
    const b = snap(1, { ...BASE, D1: [9999, 200] });
    const reports = detectAberrantSpeed(a, b, GLOBAL_MAX, rules);
    expect(reports.find((r) => r.playerId === 'D1')).toBeUndefined();
  });
});
