// Tests F.1 — Junk defense (Box-and-1).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { PLAYER_MIN_CLEARANCE_PX, HOOP } from '@/lib/data/court';

function makeJunkScenario(chaser: 'O1' | 'O2' | 'O3' | 'O4' | 'O5' = 'O3'): AppState {
  const base = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 480 },                 // porteur top
    O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  };
  return {
    ...base,
    steps: [{ off, ballCarrier: 'O1', annotations: [] }],
    activeStep: 0,
    defenseSystem: 'junk',
    junkConfig: { type: 'box-and-1', chaser },
  };
}

describe('F.1 — Box-and-1 V1', () => {
  it('place les 4 non-chasers sur les 4 slots box autour du panier', () => {
    const state = makeJunkScenario('O3'); // D3 devient chaser, D1/D2/D4/D5 zone
    const def = effectiveDefensePositions(state, 0);
    const nonChaserIds: Array<'D1' | 'D2' | 'D4' | 'D5'> = ['D1', 'D2', 'D4', 'D5'];
    nonChaserIds.forEach((dId) => {
      const dx = Math.abs(def[dId].x - HOOP.x);
      const dy = Math.abs(def[dId].y - HOOP.y);
      // Chaque slot box est à dx=80 px et dy=60 px du panier.
      // dySign peut être ±1 selon attackingDirection (default up → dySign=1).
      expect(dx).toBeCloseTo(80, 1);
      expect(dy).toBeCloseTo(60, 1);
    });
  });

  it('les 4 slots box sont DISTINCTS (pas 2 défenseurs au même endroit)', () => {
    const state = makeJunkScenario('O3');
    const def = effectiveDefensePositions(state, 0);
    const positions = ['D1', 'D2', 'D4', 'D5'].map((d) => ({ d, x: def[d as 'D1'].x, y: def[d as 'D1'].y }));
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
        expect(dist, `${positions[i].d} ≠ ${positions[j].d}`).toBeGreaterThan(50);
      }
    }
  });

  it('le chaser (D3 pour chaser=O3) est collé à son homme à ~18 px', () => {
    const state = makeJunkScenario('O3');
    const def = effectiveDefensePositions(state, 0);
    const o3 = state.steps[0].off.O3;
    const distChaserToO3 = Math.hypot(def.D3.x - o3.x, def.D3.y - o3.y);
    // Tolérance large : la position cible est à 18 px, mais effectiveDefensePositions
    // peut clamper par maxSpeed et anti-collision.
    expect(distChaserToO3).toBeGreaterThan(10);
    expect(distChaserToO3).toBeLessThan(60);
  });

  it("matchedTo du chaser pointe sur l'attaquant ciblé (junkConfig.chaser)", () => {
    const state = makeJunkScenario('O5');
    const def = effectiveDefensePositions(state, 0);
    expect(def.D5.matchedTo).toBe('O5');
    expect(def.D5.helpFactor).toBe(0);
  });

  it('helpFactor=0 sur tous les 5 défenseurs (no help possible en junk)', () => {
    const state = makeJunkScenario('O3');
    const def = effectiveDefensePositions(state, 0);
    for (const d of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      expect(def[d].helpFactor, `${d} helpFactor`).toBe(0);
      expect(def[d].helpTriggered, `${d} helpTriggered`).toBeFalsy();
    }
  });

  it('INVARIANT clearance : toutes les paires Def↔Att non-matchées ≥ 34 px', () => {
    const state = makeJunkScenario('O3');
    const def = effectiveDefensePositions(state, 0);
    const off = state.steps[0].off;
    const DEFS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const ATTS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
    DEFS.forEach((dId) => {
      ATTS.forEach((oId) => {
        if (def[dId].matchedTo === oId) return; // OK que le chaser soit collé à son homme
        const d = Math.hypot(def[dId].x - off[oId].x, def[dId].y - off[oId].y);
        expect(d, `${dId} ↔ ${oId}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    });
  });

  it('chaser quand son homme porte la balle → isCarrierDefender true', () => {
    const state = makeJunkScenario('O1'); // shooter ciblé = porteur
    const def = effectiveDefensePositions(state, 0);
    // D1 chase O1 qui est porteur.
    expect(def.D1.matchedTo).toBe('O1');
    expect(def.D1.isCarrierDefender).toBe(true);
  });

  it('quand chaser change cible, le défenseur naturel suit (D2 si chaser=O2)', () => {
    const state = makeJunkScenario('O2');
    const def = effectiveDefensePositions(state, 0);
    // D2 devient le chaser, suit O2.
    expect(def.D2.matchedTo).toBe('O2');
    // D1/D3/D4/D5 sont sur les slots box.
    for (const d of ['D1', 'D3', 'D4', 'D5'] as const) {
      const dx = Math.abs(def[d].x - HOOP.x);
      const dy = Math.abs(def[d].y - HOOP.y);
      expect(dx).toBeCloseTo(80, 1);
      expect(dy).toBeCloseTo(60, 1);
    }
  });
});
