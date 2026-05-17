// Tests B.3 — End-of-quarter contest mode awareness.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { detectEndOfClockContest } from '@/lib/logic/defense/detectEndOfClockContest';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';

/** Scénario 1-step minimal : porteur au top, configurations diverses
 *  via overrides. Le carrierDef sera D1 par défaut. */
function makeEndOfClockScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  };
  return {
    ...base,
    steps: [{ off, ballCarrier: 'O1', annotations: [], clockSeconds: 3 }],
    activeStep: 0,
    defenseTeamFouls: 5, // équipe en bonus → pas d'option foul to give
    ...overrides,
  };
}

describe('detectEndOfClockContest', () => {
  it('détecte la situation quand clock<5 ET fautes>=5 (bonus)', () => {
    const state = makeEndOfClockScenario();
    const sig = detectEndOfClockContest(state, 0);
    expect(sig).not.toBeNull();
    expect(sig!.carrierDefender).toBe('D1');
    expect(sig!.clockSeconds).toBe(3);
    expect(sig!.teamFouls).toBe(5);
  });

  it('retourne null si clockSeconds indéfini', () => {
    const state = makeEndOfClockScenario();
    state.steps[0] = { ...state.steps[0], clockSeconds: undefined };
    expect(detectEndOfClockContest(state, 0)).toBeNull();
  });

  it('retourne null si clockSeconds >= 5', () => {
    const state = makeEndOfClockScenario();
    state.steps[0] = { ...state.steps[0], clockSeconds: 8 };
    expect(detectEndOfClockContest(state, 0)).toBeNull();
  });

  it('retourne null si fautes équipe < 5 (foul to give serait l\'option, pas B.3)', () => {
    const state = makeEndOfClockScenario({ defenseTeamFouls: 2 });
    expect(detectEndOfClockContest(state, 0)).toBeNull();
  });

  it('retourne null si fautes équipe indéfinies (default 0 < 5)', () => {
    const state = makeEndOfClockScenario({ defenseTeamFouls: undefined });
    expect(detectEndOfClockContest(state, 0)).toBeNull();
  });
});

describe('endOfClockRule (intégration coachDiagnostics)', () => {
  it('émet un diagnostic warning avec le tag end-of-clock-contest', () => {
    const state = makeEndOfClockScenario();
    const diags = computeCoachDiagnostics(state, 0);
    const found = diags.find((d) => d.tag === 'end-of-clock-contest');
    expect(found).toBeDefined();
    expect(found!.severity).toBe('warning');
    expect(found!.defenders).toEqual(['D1']);
  });

  it('INVARIANT : B.3 et F.4 sont mutuellement exclusifs (axe defenseTeamFouls)', () => {
    // Cas 1 : fautes < 5 → seul F.4 peut se déclencher (jamais B.3).
    const stateF4 = makeEndOfClockScenario({ defenseTeamFouls: 2 });
    // Avec un drive : F.4 peut s'activer, B.3 jamais.
    stateF4.steps = [
      { off: stateF4.steps[0].off, ballCarrier: 'O1', annotations: [] },
      { ...stateF4.steps[0], off: { ...stateF4.steps[0].off, O1: { x: 290, y: 280 } } },
    ];
    stateF4.activeStep = 1;
    stateF4.triggers = { drive: true, post: false, paint: true, trap: false };
    const diagsF4 = computeCoachDiagnostics(stateF4, 1);
    const hasB3 = diagsF4.some((d) => d.tag === 'end-of-clock-contest');
    expect(hasB3, 'B.3 ne doit pas se déclencher si fautes < 5').toBe(false);

    // Cas 2 : fautes >= 5 → seul B.3 peut se déclencher (jamais F.4).
    const stateB3 = makeEndOfClockScenario({ defenseTeamFouls: 5 });
    const diagsB3 = computeCoachDiagnostics(stateB3, 0);
    const hasF4 = diagsB3.some((d) => d.tag === 'foul-to-give');
    expect(hasF4, 'F.4 ne doit pas se déclencher si fautes >= 5').toBe(false);
  });
});
