// Tests Phase I B5+ — auto-tuning de creativity.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import { autoTuneCreativity } from '../autoTuning';
import { PPP_TOLERANCE } from '../calibration';

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

describe('autoTuneCreativity', () => {
  it("retourne un résultat avec creativity ∈ [0, 1]", () => {
    const baseState = buildState('pnr-central');
    const result = autoTuneCreativity(baseState, {
      runsPerStep: 20,
      seed: 42,
      maxIterations: 3, // court pour test rapide
    });
    expect(result.bestCreativity).toBeGreaterThanOrEqual(0);
    expect(result.bestCreativity).toBeLessThanOrEqual(1);
  });

  it("history a au moins 1 entrée et au plus maxIterations", () => {
    const baseState = buildState('pnr-central');
    const result = autoTuneCreativity(baseState, {
      runsPerStep: 20,
      seed: 7,
      maxIterations: 4,
    });
    expect(result.history.length).toBeGreaterThanOrEqual(1);
    expect(result.history.length).toBeLessThanOrEqual(4);
  });

  it("converged = true si |bestDelta| ≤ PPP_TOLERANCE", () => {
    const baseState = buildState('pnr-central');
    const result = autoTuneCreativity(baseState, {
      runsPerStep: 30,
      seed: 100,
      maxIterations: 8,
    });
    if (Math.abs(result.bestDelta) <= PPP_TOLERANCE) {
      expect(result.converged).toBe(true);
    } else {
      expect(result.converged).toBe(false);
    }
  });

  it("finalReport correspond au bestCreativity", () => {
    const baseState = buildState('pnr-central');
    const result = autoTuneCreativity(baseState, {
      runsPerStep: 20,
      seed: 13,
      maxIterations: 3,
    });
    // Le finalReport doit être celui d'une itération du history (= existe)
    expect(result.finalReport).toBeDefined();
    expect(result.finalReport.delta.ppp).toBe(result.bestDelta);
  });

  it("est déterministe : même seed produit le même résultat", () => {
    const baseState = buildState('pnr-central');
    const a = autoTuneCreativity(baseState, {
      runsPerStep: 20,
      seed: 999,
      maxIterations: 3,
    });
    const b = autoTuneCreativity(baseState, {
      runsPerStep: 20,
      seed: 999,
      maxIterations: 3,
    });
    expect(a.bestCreativity).toBe(b.bestCreativity);
    expect(a.bestDelta).toBe(b.bestDelta);
    expect(a.iterations).toBe(b.iterations);
  });
});
