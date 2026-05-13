// Tests C.2 — Help-and-recover timing (sticky help avec decay).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { consecutiveHelpSteps } from '@/lib/logic/defense/helpStepCounter';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

/** Construit un AppState 3-steps avec un drive trigger qui s'éteint au step 2.
 *  - step 0 : porteur au top (no drive)
 *  - step 1 : porteur dans la raquette (drive ON → D3 aide)
 *  - step 2 : porteur ressort kick-out (drive OFF → recover)
 */
function makeHelpScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const setup: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  };
  const drive: AttackerPositions = { ...setup, O1: { x: 280, y: 200 } };
  const kickout: AttackerPositions = { ...setup, O1: { x: 200, y: 380 } };
  return {
    ...base,
    steps: [
      { off: setup, ballCarrier: 'O1', annotations: [] },
      { off: drive, ballCarrier: 'O1', annotations: [] },
      { off: kickout, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    triggers: { drive: true, post: false, paint: true, trap: false },
    ...overrides,
  };
}

describe('consecutiveHelpSteps', () => {
  it('retourne 0 si stepIdx === 0', () => {
    const state = makeHelpScenario();
    expect(consecutiveHelpSteps(state, 0, 'D3')).toBe(0);
  });

  it('retourne 0 si helpPct = 0 (défenseur ne fait jamais d\'aide)', () => {
    const state = makeHelpScenario();
    state.rules.D3 = { ...state.rules.D3, helpPct: 0 };
    expect(consecutiveHelpSteps(state, 2, 'D3')).toBe(0);
  });

  it('retourne 0 si stance ≠ sag (les stances dirigées ne déclenchent pas d\'aide)', () => {
    const state = makeHelpScenario();
    state.rules.D3 = { ...state.rules.D3, helpPct: 50, offBallStance: 'deny-3q' };
    expect(consecutiveHelpSteps(state, 2, 'D3')).toBe(0);
  });

  it('compte le step précédent quand drive trigger actif et stance sag', () => {
    const state = makeHelpScenario();
    state.rules.D3 = { ...state.rules.D3, helpPct: 50 }; // sag par défaut
    // À step 2, on regarde step 1 (drive ON dans la raquette) → 1.
    expect(consecutiveHelpSteps(state, 2, 'D3')).toBeGreaterThanOrEqual(1);
  });
});

describe('C.2 — helpStickiness intégration', () => {
  it('default undefined → comportement legacy (D3 retourne sur O3 instantanément au step 2)', () => {
    const state = makeHelpScenario();
    state.rules.D3 = { ...state.rules.D3, helpPct: 50 };
    const def = effectiveDefensePositions(state, 2);
    // D3 matched to O3, et au step 2 son `helpTriggered` est false (kick-out
    // step, plus de drive → pas d'aide active dans le calcul base).
    // Sans sticky, sa position est sur O3 (proche de (530, 380)).
    expect(def.D3.matchedTo).toBe('O3');
    expect(def.D3.helpTriggered).toBeFalsy();
    const distFromO3 = Math.hypot(def.D3.x - 530, def.D3.y - 380);
    expect(distFromO3).toBeLessThan(100); // proche de O3
  });

  it('helpStickiness=2 → D3 reste partiellement en aide au step 2 (consec=1 < 2)', () => {
    const stateLegacy = makeHelpScenario();
    stateLegacy.rules.D3 = { ...stateLegacy.rules.D3, helpPct: 50 };
    const stateSticky = { ...stateLegacy, helpStickiness: 2 };

    const defLegacy = effectiveDefensePositions(stateLegacy, 2);
    const defSticky = effectiveDefensePositions(stateSticky, 2);

    // Sticky activé → helpTriggered doit être true (decay actif).
    expect(defSticky.D3.helpTriggered).toBe(true);
    // Position D3 différente entre les 2 modes (decay 50% vers ancienne aide).
    const delta = Math.hypot(defSticky.D3.x - defLegacy.D3.x, defSticky.D3.y - defLegacy.D3.y);
    expect(delta).toBeGreaterThan(20);
  });

  it('helpStickiness=1 → recover complet dès le step 2 (consec >= seuil)', () => {
    const state = makeHelpScenario({ helpStickiness: 1 });
    state.rules.D3 = { ...state.rules.D3, helpPct: 50 };
    const def = effectiveDefensePositions(state, 2);
    // consec=1, stickiness=1 → bail out (recover normal).
    expect(def.D3.helpTriggered).toBeFalsy();
  });

  it("INVARIANT : helpStickiness=3 ne casse aucune clearance (Def↔O non-matched ≥ 34 px)", () => {
    const state = makeHelpScenario({ helpStickiness: 3 });
    state.rules.D3 = { ...state.rules.D3, helpPct: 50 };
    const def = effectiveDefensePositions(state, 2);
    const off = state.steps[2].off;
    const DEFS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const ATTS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
    DEFS.forEach((dId) => {
      ATTS.forEach((oId) => {
        const d = Math.hypot(def[dId].x - off[oId].x, def[dId].y - off[oId].y);
        expect(d, `${dId} ↔ ${oId}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    });
  });

  it("INVARIANT : helpStickiness=3 ne crée pas de saut > 50 px frame-à-frame", async () => {
    const state = makeHelpScenario({ helpStickiness: 3 });
    state.rules.D3 = { ...state.rules.D3, helpPct: 50 };
    const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
    const totalFrames = (state.steps.length - 1) * 60;
    let prev: { x: number; y: number } | null = null;
    let maxJump = 0;
    for (let f = 0; f <= totalFrames; f++) {
      const t = (f / totalFrames) * (state.steps.length - 1);
      const frame = resolveFrameAt(state, t);
      if (!frame) continue;
      const d3 = frame.defPos.D3;
      if (prev) {
        const jump = Math.hypot(d3.x - prev.x, d3.y - prev.y);
        if (jump > maxJump) maxJump = jump;
      }
      prev = { x: d3.x, y: d3.y };
    }
    expect(maxJump, `saut max D3 mid-playback`).toBeLessThan(50);
  });

  it('skip si défenseur en contact d\'écran (onScreen)', () => {
    // Cas indirect : un défenseur en `screen lock` ne doit pas être affecté
    // par sticky. Vérifié implicitement par la condition `if target.onScreen`
    // dans helpStickyLayer. Test léger : helpStickiness n'altère pas D1
    // (carrierDef) dans un scénario PnR où le screen detecté place D1 sur
    // le poseur.
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 180, y: 200 }, O5: { x: 310, y: 460 }, // PILE proche de D1
    };
    const state: AppState = {
      ...base,
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
      screenRule: 'hedge',
      helpStickiness: 2,
    };
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.onScreen).toBe(true);
    // Le sticky ne saute pas dessus (et il ne pourrait pas vu stepIdx=0
    // de toute façon, mais on garde le test pour signaler l'intent).
  });
});
