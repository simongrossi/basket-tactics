// Tests K.3 — Détection défenseur décroché (pure).

import { describe, expect, it } from 'vitest';
import { detectDetachedDefenders, DETACHED_DEFENDER_PX } from '@/lib/logic/anomaly/anomalyDetector';
import type { AttackerPositions, ComputedDefense, AttackerId, DefenderId, Point, ScreenContactPhase } from '@/lib/types';

function mkOff(positions: Record<AttackerId, [number, number]>): AttackerPositions {
  return Object.fromEntries(Object.entries(positions).map(([k, [x, y]]) => [k, { x, y }])) as AttackerPositions;
}

function mkDef(rows: Array<{ id: DefenderId; pos: [number, number]; matched: AttackerId; helpFactor?: number; phase?: ScreenContactPhase }>): ComputedDefense {
  const out: Partial<ComputedDefense> = {};
  rows.forEach((r) => {
    out[r.id] = {
      x: r.pos[0],
      y: r.pos[1],
      late: false,
      helpFactor: r.helpFactor ?? 0,
      isCarrierDefender: false,
      matchedTo: r.matched,
      onScreen: false,
      screenPhase: r.phase,
      switchedThisStep: false,
    } as ComputedDefense[DefenderId];
  });
  return out as ComputedDefense;
}

const OFF: AttackerPositions = mkOff({
  O1: [100, 100], O2: [200, 100], O3: [300, 100], O4: [400, 100], O5: [500, 100],
});

describe('K.3 — détection défenseur décroché', () => {
  it('aucun flag quand les défenseurs sont collés à leur homme', () => {
    const def = mkDef([
      { id: 'D1', pos: [105, 120], matched: 'O1' },
      { id: 'D2', pos: [205, 120], matched: 'O2' },
      { id: 'D3', pos: [305, 120], matched: 'O3' },
      { id: 'D4', pos: [405, 120], matched: 'O4' },
      { id: 'D5', pos: [505, 120], matched: 'O5' },
    ]);
    expect(detectDetachedDefenders(OFF, def, 0)).toEqual([]);
  });

  it('flag un défenseur loin de son homme (sans aide ni screen)', () => {
    const def = mkDef([
      { id: 'D1', pos: [100, 600], matched: 'O1' }, // 500 px de O1
      { id: 'D2', pos: [205, 120], matched: 'O2' },
      { id: 'D3', pos: [305, 120], matched: 'O3' },
      { id: 'D4', pos: [405, 120], matched: 'O4' },
      { id: 'D5', pos: [505, 120], matched: 'O5' },
    ]);
    const reports = detectDetachedDefenders(OFF, def, 0);
    expect(reports).toHaveLength(1);
    expect(reports[0].kind).toBe('detached');
    expect(reports[0].playerId).toBe('D1');
    expect(reports[0].severity).toBe('critical'); // 500 > 450
  });

  it('ne flag PAS un défenseur en aide (helpFactor ≥ 0.1)', () => {
    const def = mkDef([
      { id: 'D1', pos: [100, 600], matched: 'O1', helpFactor: 0.8 }, // décroché mais en aide
      { id: 'D2', pos: [205, 120], matched: 'O2' },
      { id: 'D3', pos: [305, 120], matched: 'O3' },
      { id: 'D4', pos: [405, 120], matched: 'O4' },
      { id: 'D5', pos: [505, 120], matched: 'O5' },
    ]);
    expect(detectDetachedDefenders(OFF, def, 0)).toEqual([]);
  });

  it('ne flag PAS un défenseur coincé dans un screen', () => {
    const def = mkDef([
      { id: 'D1', pos: [100, 600], matched: 'O1', phase: 'stuck' },
      { id: 'D2', pos: [205, 120], matched: 'O2' },
      { id: 'D3', pos: [305, 120], matched: 'O3' },
      { id: 'D4', pos: [405, 120], matched: 'O4' },
      { id: 'D5', pos: [505, 120], matched: 'O5' },
    ]);
    expect(detectDetachedDefenders(OFF, def, 0)).toEqual([]);
  });

  it('flag warning entre seuil et critical, critical au-delà', () => {
    const def = mkDef([
      { id: 'D1', pos: [100, 400], matched: 'O1' }, // 300 px → warning (>250, <450)
      { id: 'D2', pos: [200, 700], matched: 'O2' }, // 600 px → critical
      { id: 'D3', pos: [305, 120], matched: 'O3' },
      { id: 'D4', pos: [405, 120], matched: 'O4' },
      { id: 'D5', pos: [505, 120], matched: 'O5' },
    ]);
    const reports = detectDetachedDefenders(OFF, def, 5);
    expect(reports.find((r) => r.playerId === 'D1')?.severity).toBe('warning');
    expect(reports.find((r) => r.playerId === 'D2')?.severity).toBe('critical');
    expect(reports[0].stepIdx).toBe(5);
  });

  it('respecte un seuil custom', () => {
    const def = mkDef([
      { id: 'D1', pos: [100, 300], matched: 'O1' }, // 200 px de O1
      { id: 'D2', pos: [205, 120], matched: 'O2' },
      { id: 'D3', pos: [305, 120], matched: 'O3' },
      { id: 'D4', pos: [405, 120], matched: 'O4' },
      { id: 'D5', pos: [505, 120], matched: 'O5' },
    ]);
    expect(detectDetachedDefenders(OFF, def, 0, 150)).toHaveLength(1);
    expect(detectDetachedDefenders(OFF, def, 0, 250)).toEqual([]);
  });

  it('expose la constante > 0', () => {
    expect(DETACHED_DEFENDER_PX).toBeGreaterThan(100);
  });
});
