// Tests F.2 V1 — Half-court press (2-2-1).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { computePressDefenseTargets } from '@/lib/logic/defense/pressLayer';
import { HOOP, PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

function makePressState(): AppState {
  const base = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  return {
    ...base,
    steps: [{ off, ballCarrier: 'O1', annotations: [] }],
    activeStep: 0,
    defenseSystem: 'press',
    pressConfig: { type: 'half-court' },
  };
}

describe('F.2 V1 — Half-court press', () => {
  it('engine dispatch sur defenseSystem === press', () => {
    const state = makePressState();
    // Si pas de dispatch, le moteur man tournerait et placerait les
    // défenseurs proches de leurs O matchés. Avec press, ils doivent
    // être TRÈS différents (positions hautes sur terrain offensif).
    const def = effectiveDefensePositions(state, 0);
    // En press 2-2-1, D5 (sweeper) est à hoop.y -50 = HOOP.y -50 = 25 (avec
    // attackingDirection='up' default). Loin de O5 qui est à y=200.
    expect(def.D5).toBeDefined();
    const o5 = state.steps[0].off.O5;
    const dist = Math.hypot(def.D5.x - o5.x, def.D5.y - o5.y);
    // En homme classique, D5 serait à ~40 px d'O5. En press, beaucoup
    // plus loin.
    expect(dist).toBeGreaterThan(100);
  });

  it('computePressDefenseTargets place 5 défenseurs sur les 5 slots', () => {
    const state = makePressState();
    const { positions } = computePressDefenseTargets(state, 0);
    expect(Object.keys(positions).length).toBe(5);
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      expect(positions[dId]).toBeDefined();
      expect(typeof positions[dId].x).toBe('number');
      expect(typeof positions[dId].y).toBe('number');
    });
  });

  it("formation 2-2-1 : 2 défenseurs sur ligne médiane (les plus loin du panier)", () => {
    const state = makePressState();
    const { positions } = computePressDefenseTargets(state, 0);
    // Le panier defense est en haut (HOOP.y = 75). La ligne médiane est
    // à y ≈ 540 (dy = -460 vers offense, mais on flip pour up).
    // Actually with attackingDirection='up' (default), hoop.y=75,
    // dySign = -1, donc y = 75 + (-460) * -1 = 535. Cohérent.
    const yValues = (['D1', 'D2', 'D3', 'D4', 'D5'] as const).map((d) => positions[d].y);
    yValues.sort((a, b) => b - a); // descending
    // Les 2 plus grandes valeurs (= les plus éloignées du panier en haut) sont les front line.
    expect(yValues[0]).toBeCloseTo(535, 0);
    expect(yValues[1]).toBeCloseTo(535, 0);
  });

  it("sweeper (D5) le plus proche du panier defense", () => {
    const state = makePressState();
    const { positions } = computePressDefenseTargets(state, 0);
    // D5 a dy = -50, donc y = 75 + 50 = 125 (le plus proche du panier en haut).
    const distFromHoop = (['D1', 'D2', 'D3', 'D4', 'D5'] as const).map((d) => ({
      id: d,
      dist: Math.hypot(positions[d].x - HOOP.x, positions[d].y - HOOP.y),
    }));
    distFromHoop.sort((a, b) => a.dist - b.dist);
    expect(distFromHoop[0].id).toBe('D5');
  });

  it("helpFactor = 0 sur tous les défenseurs (presse = no help structurel)", () => {
    const state = makePressState();
    const { positions } = computePressDefenseTargets(state, 0);
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      expect(positions[dId].helpFactor).toBe(0);
    });
  });

  it("matchups préservés (chacun garde son matched naturel)", () => {
    const state = makePressState();
    const { positions, matchupsApplied } = computePressDefenseTargets(state, 0);
    expect(positions.D1.matchedTo).toBe('O1');
    expect(positions.D2.matchedTo).toBe('O2');
    expect(positions.D5.matchedTo).toBe('O5');
    expect(matchupsApplied.D1).toBe('O1');
  });

  it("INVARIANT clearance : positions presse respectent PLAYER_MIN_CLEARANCE_PX", () => {
    const state = makePressState();
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

describe('F.2 V2 — Full-court press 1-2-1-1', () => {
  function makeFullCourtPressState(carrierY = 480): AppState {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: carrierY }, // porteur, position variable
      O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    return {
      ...base,
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      defenseSystem: 'press',
      pressConfig: { type: 'full-court' },
    };
  }

  it("full-court : chaser le PLUS éloigné du panier defense (sous panier offense)", () => {
    const state = makeFullCourtPressState();
    const def = effectiveDefensePositions(state, 0);
    // chaser = D1 (premier slot). dy=-720, donc y = 75 + 720 = 795 (avec attackingDirection up).
    const distFromHoop = (['D1', 'D2', 'D3', 'D4', 'D5'] as const).map((d) => ({
      id: d,
      dist: Math.hypot(def[d].x - HOOP.x, def[d].y - HOOP.y),
    }));
    distFromHoop.sort((a, b) => b.dist - a.dist);
    // Le défenseur le plus loin du panier defense doit être le chaser.
    expect(distFromHoop[0].id).toBe('D1');
  });

  it("full-court positions distinctes de half-court", () => {
    const half = makePressState(); // half-court
    const full = makeFullCourtPressState();
    const defHalf = effectiveDefensePositions(half, 0);
    const defFull = effectiveDefensePositions(full, 0);
    let maxDelta = 0;
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const d = Math.hypot(defHalf[dId].x - defFull[dId].x, defHalf[dId].y - defFull[dId].y);
      if (d > maxDelta) maxDelta = d;
    });
    expect(maxDelta).toBeGreaterThan(200);
  });

  it("TRAP dynamique : porteur côté offense (y < 540) → 2 défenseurs proches modifiés", () => {
    // Compare avec trap désactivé vs activé.
    const stateNoTrap: AppState = {
      ...makeFullCourtPressState(400),
      pressConfig: { type: 'full-court', trapOnHalfCourtCross: false },
    };
    const stateWithTrap = makeFullCourtPressState(400); // y=400 < 540, dans offense
    const defNoTrap = effectiveDefensePositions(stateNoTrap, 0);
    const defTrap = effectiveDefensePositions(stateWithTrap, 0);
    // Au moins 2 défenseurs doivent avoir bougé (les trappers).
    let movedCount = 0;
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const d = Math.hypot(defNoTrap[dId].x - defTrap[dId].x, defNoTrap[dId].y - defTrap[dId].y);
      if (d > 5) movedCount++;
    });
    expect(movedCount).toBeGreaterThanOrEqual(2);
  });

  it("TRAP : pas de trap si porteur côté défense (y > 540)", () => {
    const stateWithTrap = makeFullCourtPressState(680); // y > 540, dans backcourt défense
    const stateNoTrap: AppState = {
      ...stateWithTrap,
      pressConfig: { type: 'full-court', trapOnHalfCourtCross: false },
    };
    const defTrap = effectiveDefensePositions(stateWithTrap, 0);
    const defNoTrap = effectiveDefensePositions(stateNoTrap, 0);
    // Pas de trap : positions identiques.
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const d = Math.hypot(defTrap[dId].x - defNoTrap[dId].x, defTrap[dId].y - defNoTrap[dId].y);
      expect(d, `${dId} doit être identique sans trap`).toBeLessThan(2);
    });
  });

  it("INVARIANT clearance avec trap actif", () => {
    const state = makeFullCourtPressState(400); // trap actif
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

  it("trapOnHalfCourtCross override fonctionne (true sur half-court active le trap)", () => {
    // Cas exotique : on force trap=true même sur half-court.
    const stateHalfTrap: AppState = {
      ...makePressState(),
      pressConfig: { type: 'half-court', trapOnHalfCourtCross: true },
    };
    stateHalfTrap.steps[0] = { ...stateHalfTrap.steps[0], off: {
      ...stateHalfTrap.steps[0].off,
      O1: { x: 300, y: 400 }, // porteur côté offense pour déclencher trap
    } };
    const defHalfTrap = effectiveDefensePositions(stateHalfTrap, 0);
    const defHalfNoTrap: AppState = {
      ...stateHalfTrap,
      pressConfig: { type: 'half-court', trapOnHalfCourtCross: false },
    };
    const def2 = effectiveDefensePositions(defHalfNoTrap, 0);
    // Le trap force la modif même en half-court.
    let movedCount = 0;
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const d = Math.hypot(defHalfTrap[dId].x - def2[dId].x, defHalfTrap[dId].y - def2[dId].y);
      if (d > 5) movedCount++;
    });
    expect(movedCount).toBeGreaterThanOrEqual(2);
  });
});

describe('F.2 V1 — comparaison vs autres systèmes', () => {
  it('press positions ≠ man positions (signature distincte)', () => {
    const stateMan = makePressState();
    stateMan.defenseSystem = 'man';
    const stateP = makePressState();
    const defMan = effectiveDefensePositions(stateMan, 0);
    const defPress = effectiveDefensePositions(stateP, 0);
    // Au moins un défenseur doit être à plus de 100 px de différence.
    let maxDelta = 0;
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const d = Math.hypot(defMan[dId].x - defPress[dId].x, defMan[dId].y - defPress[dId].y);
      if (d > maxDelta) maxDelta = d;
    });
    expect(maxDelta).toBeGreaterThan(100);
  });

  it('press positions ≠ zone positions', () => {
    const stateZone = makePressState();
    stateZone.defenseSystem = 'zone';
    const stateP = makePressState();
    const defZone = effectiveDefensePositions(stateZone, 0);
    const defPress = effectiveDefensePositions(stateP, 0);
    let maxDelta = 0;
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId) => {
      const d = Math.hypot(defZone[dId].x - defPress[dId].x, defZone[dId].y - defPress[dId].y);
      if (d > maxDelta) maxDelta = d;
    });
    expect(maxDelta).toBeGreaterThan(100);
  });
});
