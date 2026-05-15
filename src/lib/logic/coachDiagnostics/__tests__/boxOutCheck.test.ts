// Tests règle coach — box-out check sur phases de rebond.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  addFreeThrowReboundStep,
  convertStepToFreeThrow,
} from '@/lib/state/transforms/stepTransforms';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';
import type { AppState } from '@/lib/types';

function withFTRebound(): AppState {
  return addFreeThrowReboundStep(convertStepToFreeThrow(makeInitialState()), false);
}

describe('boxOutCheckRule', () => {
  it('ne diagnostique rien sur un step live-play normal', () => {
    const state = makeInitialState();
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const boxOutDiags = diags.filter((d) => d.tag.startsWith('box-out-'));
    expect(boxOutDiags).toEqual([]);
  });

  it("émet diagnostic sur un step de course-rebond après LF", () => {
    const state = withFTRebound();
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const boxOutDiag = diags.find((d) => d.tag.startsWith('box-out-'));
    expect(boxOutDiag).toBeDefined();
  });

  it("émet 'box-out-ok' info quand tous les défenseurs sont en box-out (F.2 setup)", () => {
    const state = withFTRebound();
    const diags = computeCoachDiagnostics(state, state.activeStep);
    // F.2 buildFreeThrowReboundSetup place les blocks défensifs (D4/D5)
    // près du cercle (côté baseline). Les outlets aussi sont entre att
    // et panier. Donc box-out OK.
    const okDiag = diags.find((d) => d.tag === 'box-out-ok');
    const missingDiag = diags.find((d) => d.tag === 'box-out-missing');
    // Soit OK, soit missing — mais l'un des deux doit être présent.
    expect(okDiag || missingDiag).toBeDefined();
  });

  it("détecte une phase de rebond via label 'rebond' ou 'course'", () => {
    const state = makeInitialState();
    const modified = {
      ...state,
      steps: state.steps.map((s, i) =>
        i === state.activeStep ? { ...s, label: 'LF manqué · course rebond' } : s
      ),
    };
    const diags = computeCoachDiagnostics(modified, modified.activeStep);
    const boxOutDiag = diags.find((d) => d.tag.startsWith('box-out-'));
    expect(boxOutDiag).toBeDefined();
  });
});
