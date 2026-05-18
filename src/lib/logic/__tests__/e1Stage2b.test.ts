// Tests E.1 V2 stage 2b — Phase de possession adverse.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import {
  buildAwayPossessionSetup,
  HALF_COURT_Y,
} from '@/lib/logic/awayPossessionSetup';
import { convertStepToAwayPossession } from '@/lib/state/transforms/stepTransforms';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeBaseState(): AppState {
  const base = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
  };
  const def: DefenderPositions = {
    D1: { x: 300, y: 540 }, D2: { x: 130, y: 410 }, D3: { x: 470, y: 410 },
    D4: { x: 240, y: 230 }, D5: { x: 360, y: 230 },
  };
  return {
    ...base,
    steps: [{ off, ballCarrier: 'O1', annotations: [] }],
    activeStep: 0,
    defenseInitial: def,
  };
}

describe('E.1 stage 2b — buildAwayPossessionSetup', () => {
  it('HALF_COURT_Y = 540 (cohérent avec game loop)', () => {
    expect(HALF_COURT_Y).toBe(540);
  });

  it('défenseurs sourceStep → attaquants step adverse (mirror vertical)', () => {
    const state = makeBaseState();
    const sourceDef = effectiveDefensePositions(state, 0);
    const setup = buildAwayPossessionSetup(state, 0);
    // Pour chaque paire (Di → Oi), y attendu = 2*HALF_COURT_Y - sourceDef.y
    (['D1', 'D2', 'D3', 'D4', 'D5'] as const).forEach((dId, i) => {
      const oId = (['O1', 'O2', 'O3', 'O4', 'O5'] as const)[i];
      expect(setup.off[oId].y).toBeCloseTo(2 * HALF_COURT_Y - sourceDef[dId].y, 1);
    });
  });

  it('attaquants sourceStep → défenseurs step adverse (mirror vertical)', () => {
    const state = makeBaseState();
    const setup = buildAwayPossessionSetup(state, 0);
    const sourceOff = state.steps[0].off;
    (['O1', 'O2', 'O3', 'O4', 'O5'] as const).forEach((oId, i) => {
      const dId = (['D1', 'D2', 'D3', 'D4', 'D5'] as const)[i];
      expect(setup.def[dId].y).toBeCloseTo(2 * HALF_COURT_Y - sourceOff[oId].y, 1);
    });
  });

  it('x conservé (mirror UNIQUEMENT vertical)', () => {
    const state = makeBaseState();
    const sourceDef = effectiveDefensePositions(state, 0);
    const setup = buildAwayPossessionSetup(state, 0);
    const sourceOff = state.steps[0].off;
    // O step adverse récupère x du D source.
    expect(setup.off.O1.x).toBeCloseTo(sourceDef.D1.x, 1);
    expect(setup.off.O2.x).toBeCloseTo(sourceDef.D2.x, 1);
    // D step adverse récupère x du O source.
    expect(setup.def.D1.x).toBe(sourceOff.O1.x);
    expect(setup.def.D2.x).toBe(sourceOff.O2.x);
  });

  it('porteur du step adverse = O1', () => {
    const state = makeBaseState();
    const setup = buildAwayPossessionSetup(state, 0);
    expect(setup.ballCarrier).toBe('O1');
  });

  it('positions adverses sont sous la médiane (y > HALF_COURT_Y)', () => {
    // Vu que le scenario source a tout en y < 540 (top half = home),
    // le mirror doit donner y > 540 partout (= bottom half = away).
    const state = makeBaseState();
    const setup = buildAwayPossessionSetup(state, 0);
    Object.values(setup.off).forEach((p) => {
      expect(p.y).toBeGreaterThanOrEqual(HALF_COURT_Y - 1);
    });
    Object.values(setup.def).forEach((p) => {
      expect(p.y).toBeGreaterThanOrEqual(HALF_COURT_Y - 1);
    });
  });
});

describe('E.1 stage 2b — convertStepToAwayPossession (transform)', () => {
  it("mode 'insert' (default) ajoute un step après sourceStepIdx", () => {
    const state = makeBaseState();
    const next = convertStepToAwayPossession(state);
    expect(next.steps.length).toBe(state.steps.length + 1);
    expect(next.activeStep).toBe(1);
    expect(next.steps[1].viewSide).toBe('away');
    expect(next.steps[1].label).toBe('Transition adverse');
  });

  it("mode 'replace' modifie le step actif sans en ajouter", () => {
    const state = makeBaseState();
    const next = convertStepToAwayPossession(state, { mode: 'replace' });
    expect(next.steps.length).toBe(state.steps.length);
    expect(next.steps[0].viewSide).toBe('away');
    expect(next.steps[0].label).toBe('Phase adverse');
  });

  it("step adverse a defenseOverrides figés", () => {
    const state = makeBaseState();
    const next = convertStepToAwayPossession(state);
    expect(next.steps[1].defenseOverrides).toBeDefined();
    expect(Object.keys(next.steps[1].defenseOverrides!).length).toBe(5);
  });

  it("step inchangé si sourceStepIdx invalide", () => {
    const state = makeBaseState();
    const next = convertStepToAwayPossession(state, { sourceStepIdx: 99 });
    expect(next).toBe(state);
  });

  it("rétrocompat : steps existants sans viewSide ne sont pas affectés", () => {
    const state = makeBaseState();
    expect(state.steps[0].viewSide).toBeUndefined();
    // Convert step 0, vérifier step 0 inchangé (en mode insert).
    const next = convertStepToAwayPossession(state, { mode: 'insert' });
    expect(next.steps[0].viewSide).toBeUndefined();
  });

  it("default viewSide undefined = 'home' (comportement legacy)", () => {
    const state = makeBaseState();
    // Aucun step n'a viewSide posé par défaut.
    state.steps.forEach((step) => {
      expect(step.viewSide).toBeUndefined();
    });
  });
});

describe('E.1 stage 2b — awayPossessionRule (diag coach)', () => {
  it('émet un diag info quand step.viewSide === away', async () => {
    const state = makeBaseState();
    const next = convertStepToAwayPossession(state);
    const { computeCoachDiagnostics } = await import('@/lib/logic/coachDiagnostics');
    const diags = computeCoachDiagnostics(next, 1);
    const awayDiag = diags.find((d) => d.tag === 'away-possession');
    expect(awayDiag).toBeDefined();
    expect(awayDiag?.severity).toBe('info');
  });

  it("n'émet PAS de diag sur step viewSide === home (default)", async () => {
    const state = makeBaseState();
    const { computeCoachDiagnostics } = await import('@/lib/logic/coachDiagnostics');
    const diags = computeCoachDiagnostics(state, 0);
    expect(diags.find((d) => d.tag === 'away-possession')).toBeUndefined();
  });

  it("n'émet PAS de diag sur step viewSide explicitement home", async () => {
    const state = makeBaseState();
    state.steps[0] = { ...state.steps[0], viewSide: 'home' };
    const { computeCoachDiagnostics } = await import('@/lib/logic/coachDiagnostics');
    const diags = computeCoachDiagnostics(state, 0);
    expect(diags.find((d) => d.tag === 'away-possession')).toBeUndefined();
  });
});
