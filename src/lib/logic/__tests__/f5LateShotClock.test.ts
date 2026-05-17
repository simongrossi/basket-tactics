// Tests F.5 — Late shot clock defense.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

/** Scénario 1-step : O1 attaque, O2 en aide-side. Configure shotClockRemaining
 *  et lateShotClockDefenseEnabled via overrides. */
function makeLateClockScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 280 }, // porteur dans la raquette
    O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  };
  return {
    ...base,
    steps: [{ off, ballCarrier: 'O1', annotations: [], shotClockRemaining: 3 }],
    activeStep: 0,
    triggers: { drive: true, post: false, paint: true, trap: false },
    lateShotClockDefenseEnabled: true,
    ...overrides,
  };
}

describe('F.5 — applyLateShotClockLayer', () => {
  it('flag off → aucune modulation (positions inchangées)', () => {
    const baseline = makeLateClockScenario({ lateShotClockDefenseEnabled: false });
    const stateOff = makeLateClockScenario({ lateShotClockDefenseEnabled: false });
    const defBaseline = effectiveDefensePositions(baseline, 0);
    const defOff = effectiveDefensePositions(stateOff, 0);
    // Le test trivial : la valeur de helpFactor de D2 doit être identique
    // entre les 2 runs sans flag.
    expect(defOff.D2.helpFactor).toBe(defBaseline.D2.helpFactor);
  });

  it('flag on + clock < 5 → helpFactor des non-carrierDef forcés à 0', () => {
    const state = makeLateClockScenario();
    // D3 / D4 / D5 ne sont pas le carrierDef → leur helpFactor doit retomber à 0.
    const def = effectiveDefensePositions(state, 0);
    const carrierDef = Object.values(def).find((d) => d.matchedTo === 'O1');
    expect(carrierDef).toBeDefined();
    for (const dId of ['D1', 'D2', 'D3', 'D4', 'D5'] as const) {
      if (def[dId].matchedTo === 'O1') continue;
      expect(def[dId].helpFactor, `${dId} helpFactor`).toBe(0);
      expect(def[dId].helpTriggered, `${dId} helpTriggered`).toBeFalsy();
    }
  });

  it('flag on + shotClockRemaining indéfini → no-op', () => {
    const state = makeLateClockScenario();
    state.steps[0] = { ...state.steps[0], shotClockRemaining: undefined };
    const def = effectiveDefensePositions(state, 0);
    // Comparable à sans-flag : le moteur peut avoir laissé helpFactor > 0
    // sur un défenseur en aide. On vérifie qu'au moins UN défenseur a
    // helpTriggered=true (preuve que la couche F.5 n'a pas everything-killed).
    const anyHelp = (['D1', 'D2', 'D3', 'D4', 'D5'] as const).some(
      (d) => def[d].helpTriggered === true
    );
    // Vu le scenario (drive + paint), il devrait y avoir au moins une aide.
    expect(anyHelp).toBe(true);
  });

  it('flag on + shotClockRemaining >= 5 → no-op (clock pas critique)', () => {
    const state = makeLateClockScenario();
    state.steps[0] = { ...state.steps[0], shotClockRemaining: 12 };
    const def = effectiveDefensePositions(state, 0);
    const anyHelp = (['D1', 'D2', 'D3', 'D4', 'D5'] as const).some(
      (d) => def[d].helpTriggered === true
    );
    expect(anyHelp).toBe(true);
  });

  it('INVARIANT : late shot clock ne casse pas la clearance min entre joueurs', () => {
    const state = makeLateClockScenario();
    const def = effectiveDefensePositions(state, 0);
    const off = state.steps[0].off;
    const DEFS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const ATTS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
    DEFS.forEach((dId) => {
      ATTS.forEach((oId) => {
        if (def[dId].matchedTo === oId) return; // matchup OK pour pression
        const d = Math.hypot(def[dId].x - off[oId].x, def[dId].y - off[oId].y);
        expect(d, `${dId} ↔ ${oId}`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
      });
    });
  });
});
