// Tests A11 Phase 3 — Cohérence + boxOutCheckRule robuste.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { addShotReboundStep } from '@/lib/state/transforms/stepTransforms';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';

function makeStateWithShot(): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 250 }, O5: { x: 400, y: 250 },
  };
  const offShoot: AttackerPositions = {
    O1: { x: 300, y: 220 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
    O4: { x: 200, y: 250 }, O5: { x: 400, y: 250 },
  };
  const def0: DefenderPositions = {
    D1: { x: 300, y: 540 }, D2: { x: 130, y: 410 }, D3: { x: 470, y: 410 },
    D4: { x: 240, y: 280 }, D5: { x: 360, y: 280 },
  };
  return {
    ...base,
    steps: [
      { off: off0, ballCarrier: 'O1', annotations: [] },
      { off: offShoot, ballCarrier: 'O1', annotations: [], shotOutcome: 'missed', shotPos: offShoot.O1 },
    ],
    activeStep: 1,
    defenseInitial: def0,
  };
}

describe('A11 Phase 3 — boxOutCheckRule robuste', () => {
  it('détecte la phase rebond via Step.reboundType (A11)', () => {
    const state = makeStateWithShot();
    const next = addShotReboundStep(state, { seed: 42 });
    // Le step inséré (index 2) a reboundType posé. Diagnostic doit
    // émettre soit box-out-ok soit box-out-missing (= rule active).
    const diags = computeCoachDiagnostics(next, 2);
    const tags = diags.map((d) => d.tag);
    const matched = tags.some((t) => t === 'box-out-ok' || t === 'box-out-missing');
    expect(matched).toBe(true);
  });

  it('détecte la phase rebond via prev.shotOutcome === missed (A11)', () => {
    // Cas alternatif : le coach pose shotOutcome=missed sur step N, puis
    // ajoute manuellement un step N+1 sans utiliser addShotReboundStep.
    // La règle doit quand même détecter la phase rebond.
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 220 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 250 }, O5: { x: 400, y: 250 },
    };
    const state: AppState = {
      ...base,
      steps: [
        { off, ballCarrier: 'O1', annotations: [], shotOutcome: 'missed' },
        { off, ballCarrier: 'O1', annotations: [] }, // step suivant manuel
      ],
      activeStep: 1,
    };
    const diags = computeCoachDiagnostics(state, 1);
    const tags = diags.map((d) => d.tag);
    expect(tags.some((t) => t === 'box-out-ok' || t === 'box-out-missing')).toBe(true);
  });

  it("ne détecte PAS de phase rebond sur step standard (pas de shotOutcome ni label)", () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const state: AppState = {
      ...base,
      steps: [{ off, ballCarrier: 'O1', annotations: [] }],
      activeStep: 0,
    };
    const diags = computeCoachDiagnostics(state, 0);
    const tags = diags.map((d) => d.tag);
    expect(tags.includes('box-out-ok')).toBe(false);
    expect(tags.includes('box-out-missing')).toBe(false);
  });

  it("ne détecte PAS phase rebond si prev.shotOutcome === 'made'", () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 220 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 250 }, O5: { x: 400, y: 250 },
    };
    const state: AppState = {
      ...base,
      steps: [
        { off, ballCarrier: 'O1', annotations: [], shotOutcome: 'made' },
        { off, ballCarrier: 'O1', annotations: [] },
      ],
      activeStep: 1,
    };
    const diags = computeCoachDiagnostics(state, 1);
    const tags = diags.map((d) => d.tag);
    expect(tags.includes('box-out-ok')).toBe(false);
    expect(tags.includes('box-out-missing')).toBe(false);
  });

  it("compatibilité legacy : détection via label 'rebond' fonctionne toujours", () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const state: AppState = {
      ...base,
      steps: [{ off, ballCarrier: 'O1', annotations: [], label: 'Phase rebond' }],
      activeStep: 0,
    };
    const diags = computeCoachDiagnostics(state, 0);
    const tags = diags.map((d) => d.tag);
    expect(tags.some((t) => t === 'box-out-ok' || t === 'box-out-missing')).toBe(true);
  });
});
