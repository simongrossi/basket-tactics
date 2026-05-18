// Tests F.1 V2 — Triangle-and-2 + Diamond-and-1.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, JunkType } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { chaserCountFor } from '@/lib/logic/defense/junkLayer';
import { PLAYER_MIN_CLEARANCE_PX, HOOP } from '@/lib/data/court';

function makeScenario(type: JunkType, chaser: 'O1' | 'O2' | 'O3' | 'O4' | 'O5' = 'O3', chaser2?: 'O1' | 'O2' | 'O3' | 'O4' | 'O5'): AppState {
  const base = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  };
  return {
    ...base,
    steps: [{ off, ballCarrier: 'O1', annotations: [] }],
    activeStep: 0,
    defenseSystem: 'junk',
    junkConfig: { type, chaser, chaser2 },
  };
}

describe('F.1 — chaserCountFor', () => {
  it('box-and-1 → 1 chasseur', () => {
    expect(chaserCountFor('box-and-1')).toBe(1);
  });
  it('diamond-and-1 → 1 chasseur', () => {
    expect(chaserCountFor('diamond-and-1')).toBe(1);
  });
  it('triangle-and-2 → 2 chasseurs', () => {
    expect(chaserCountFor('triangle-and-2')).toBe(2);
  });
});

describe('F.1 V2 — Triangle-and-2', () => {
  it('place 3 défenseurs en triangle (1 haut FT line, 2 bas blocks)', () => {
    const state = makeScenario('triangle-and-2', 'O2', 'O3');
    // chasers : D2 et D3. Non-chasers : D1, D4, D5 (3 slots triangle).
    const def = effectiveDefensePositions(state, 0);
    const nonChasers = ['D1', 'D4', 'D5'] as const;
    // Tous proches du panier (≤ 130 px).
    nonChasers.forEach((dId) => {
      const dist = Math.hypot(def[dId].x - HOOP.x, def[dId].y - HOOP.y);
      expect(dist, `${dId} distance au panier`).toBeLessThan(140);
    });
    // L'un d'eux est sur la pointe haute (dx ≈ 0, dy plus grand que blocks).
    const ys = nonChasers.map((d) => Math.abs(def[d].y - HOOP.y));
    const maxY = Math.max(...ys);
    expect(maxY).toBeGreaterThan(70); // pointe haute = 80 px
  });

  it('2 chasseurs collent leurs hommes respectifs', () => {
    const state = makeScenario('triangle-and-2', 'O2', 'O3');
    const def = effectiveDefensePositions(state, 0);
    const o2 = state.steps[0].off.O2;
    const o3 = state.steps[0].off.O3;
    // D2 chase O2, D3 chase O3 (matchups naturels).
    expect(def.D2.matchedTo).toBe('O2');
    expect(def.D3.matchedTo).toBe('O3');
    const d2DistO2 = Math.hypot(def.D2.x - o2.x, def.D2.y - o2.y);
    const d3DistO3 = Math.hypot(def.D3.x - o3.x, def.D3.y - o3.y);
    expect(d2DistO2).toBeLessThan(60);
    expect(d3DistO3).toBeLessThan(60);
  });

  it('chaser2 undefined → fallback à 1 chaser (comportement dégradé prévisible)', () => {
    const state = makeScenario('triangle-and-2', 'O2');
    // Pas de chaser2 → seul D2 chase. D1, D3, D4, D5 sur slots triangle.
    // Comme il y a 4 non-chasers mais seulement 3 slots, le 4e revient au slot 0
    // par modulo (acceptable pour cas dégénéré).
    const def = effectiveDefensePositions(state, 0);
    expect(def.D2.matchedTo).toBe('O2');
    expect(state.junkConfig?.chaser2).toBeUndefined();
  });

  it('helpFactor=0 sur les 5 défenseurs même en mode 2 chasseurs', () => {
    const state = makeScenario('triangle-and-2', 'O2', 'O3');
    const def = effectiveDefensePositions(state, 0);
    for (const d of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      expect(def[d].helpFactor, `${d} helpFactor`).toBe(0);
    }
  });

  it('INVARIANT clearance triangle-and-2', () => {
    const state = makeScenario('triangle-and-2', 'O2', 'O3');
    const def = effectiveDefensePositions(state, 0);
    const off = state.steps[0].off;
    const DEFS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const ATTS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
    DEFS.forEach((dId) => {
      ATTS.forEach((oId) => {
        if (def[dId].matchedTo === oId) return;
        const d = Math.hypot(def[dId].x - off[oId].x, def[dId].y - off[oId].y);
        expect(d, `${dId} ↔ ${oId}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    });
  });
});

describe('F.1 V2 — Diamond-and-1', () => {
  it('place 4 défenseurs en losange 1-2-1', () => {
    const state = makeScenario('diamond-and-1', 'O3');
    const def = effectiveDefensePositions(state, 0);
    const nonChasers = ['D1', 'D2', 'D4', 'D5'] as const;
    // Géométrie losange : 2 défenseurs sur l'axe vertical (dx≈0),
    // 2 sur l'axe horizontal (dy≈0).
    const onVerticalAxis = nonChasers.filter((d) => Math.abs(def[d].x - HOOP.x) < 20);
    const onHorizontalAxis = nonChasers.filter((d) => Math.abs(def[d].y - HOOP.y) < 20);
    expect(onVerticalAxis.length).toBe(2); // pointe haute + pointe basse
    expect(onHorizontalAxis.length).toBe(2); // aile gauche + aile droite
  });

  it('chaser unique (1 chasseur seul)', () => {
    const state = makeScenario('diamond-and-1', 'O3');
    const def = effectiveDefensePositions(state, 0);
    expect(def.D3.matchedTo).toBe('O3');
    const o3 = state.steps[0].off.O3;
    expect(Math.hypot(def.D3.x - o3.x, def.D3.y - o3.y)).toBeLessThan(60);
  });

  it('INVARIANT clearance diamond-and-1', () => {
    const state = makeScenario('diamond-and-1', 'O5');
    const def = effectiveDefensePositions(state, 0);
    const off = state.steps[0].off;
    const DEFS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const ATTS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
    DEFS.forEach((dId) => {
      ATTS.forEach((oId) => {
        if (def[dId].matchedTo === oId) return;
        const d = Math.hypot(def[dId].x - off[oId].x, def[dId].y - off[oId].y);
        expect(d, `${dId} ↔ ${oId}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    });
  });

  it('helpFactor=0 sur les 5 défenseurs', () => {
    const state = makeScenario('diamond-and-1', 'O3');
    const def = effectiveDefensePositions(state, 0);
    for (const d of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      expect(def[d].helpFactor).toBe(0);
    }
  });
});

describe('F.1 V2 — comparaison formations', () => {
  it('box vs triangle vs diamond ont des géométries DIFFÉRENTES', () => {
    const stateBox = makeScenario('box-and-1', 'O1');
    const stateTri = makeScenario('triangle-and-2', 'O1', 'O2');
    const stateDia = makeScenario('diamond-and-1', 'O1');
    const defBox = effectiveDefensePositions(stateBox, 0);
    const defTri = effectiveDefensePositions(stateTri, 0);
    const defDia = effectiveDefensePositions(stateDia, 0);
    // D5 est non-chaser dans les 3 cas. Sa position doit varier.
    const posBox = defBox.D5;
    const posTri = defTri.D5;
    const posDia = defDia.D5;
    const d1 = Math.hypot(posBox.x - posTri.x, posBox.y - posTri.y);
    const d2 = Math.hypot(posBox.x - posDia.x, posBox.y - posDia.y);
    const d3 = Math.hypot(posTri.x - posDia.x, posTri.y - posDia.y);
    // Au moins 2 paires doivent différer significativement (> 30 px).
    const significantDiffs = [d1, d2, d3].filter((d) => d > 30).length;
    expect(significantDiffs).toBeGreaterThanOrEqual(2);
  });
});
