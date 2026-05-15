// Tests règle coach — inbound 5s violation.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { convertStepToInbound } from '@/lib/state/transforms/stepTransforms';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';
import type { Annotation, AppState } from '@/lib/types';

function withInbound(s: AppState): AppState {
  return convertStepToInbound(s, 'inbound-baseline');
}

describe('inboundFiveSec rule', () => {
  it('ne diagnostique rien sur un step live-play normal', () => {
    const state = makeInitialState();
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const inboundDiags = diags.filter((d) => d.tag.startsWith('inbound-'));
    expect(inboundDiags).toEqual([]);
  });

  it("émet 'inbound-incomplete' critical si step inbound est le dernier", () => {
    const state = withInbound(makeInitialState());
    // Un seul step total → aucune étape suivante pour la passe.
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const incomplete = diags.find((d) => d.tag === 'inbound-incomplete');
    expect(incomplete).toBeDefined();
    expect(incomplete?.severity).toBe('critical');
  });

  it("émet 'inbound-no-pass' warning si l'étape suivante n'a pas de passe", () => {
    const state = withInbound(makeInitialState());
    // Ajoute une étape suivante SANS passe.
    const next = {
      ...state.steps[0],
      annotations: [
        { type: 'cut' as const, fromId: 'O2' as const, toId: null, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      ] as Annotation[],
      context: 'live-play' as const,
    };
    const extended = { ...state, steps: [...state.steps, next] };
    const diags = computeCoachDiagnostics(extended, 0);
    const noPass = diags.find((d) => d.tag === 'inbound-no-pass');
    expect(noPass).toBeDefined();
    expect(noPass?.severity).toBe('warning');
  });

  it("émet 'inbound-5s-info' info si l'étape suivante a une passe de l'inbounder", () => {
    const state = withInbound(makeInitialState());
    const inbounder = state.steps[0].ballCarrier;
    const next = {
      ...state.steps[0],
      annotations: [
        { type: 'pass' as const, fromId: inbounder, toId: 'O2' as const, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      ] as Annotation[],
      context: 'live-play' as const,
    };
    const extended = { ...state, steps: [...state.steps, next] };
    const diags = computeCoachDiagnostics(extended, 0);
    const ok = diags.find((d) => d.tag === 'inbound-5s-info');
    expect(ok).toBeDefined();
    expect(ok?.severity).toBe('info');
  });

  it('cible le bon attaquant (le ballCarrier de la remise)', () => {
    const state = withInbound(makeInitialState());
    const inbounder = state.steps[0].ballCarrier;
    const diags = computeCoachDiagnostics(state, state.activeStep);
    const inboundDiag = diags.find((d) => d.tag.startsWith('inbound-'));
    expect(inboundDiag?.attackers).toContain(inbounder);
  });

  it("émet 'inbound-5s-overflow' critical si durée estimée > 5s avant passe", () => {
    // Setup : remise + 2 steps de mouvement avant la passe = 2 × 4s = 8s.
    const state = withInbound(makeInitialState());
    const inbounder = state.steps[0].ballCarrier;
    // Insérer 2 steps "vides" (sans passe) avant le step de passe.
    const emptyStep = {
      ...state.steps[0],
      annotations: [
        { type: 'cut' as const, fromId: 'O2' as const, toId: null, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      ] as Annotation[],
      context: 'live-play' as const,
    };
    const passStep = {
      ...state.steps[0],
      annotations: [
        { type: 'pass' as const, fromId: inbounder, toId: 'O2' as const, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      ] as Annotation[],
      context: 'live-play' as const,
    };
    const extended = {
      ...state,
      secondsPerStep: 4,
      steps: [...state.steps, emptyStep, emptyStep, passStep],
    };
    const diags = computeCoachDiagnostics(extended, 0);
    const overflow = diags.find((d) => d.tag === 'inbound-5s-overflow');
    expect(overflow).toBeDefined();
    expect(overflow?.severity).toBe('critical');
  });

  it("durée OK (≤ 5s) → verdict 'inbound-5s-info' avec durée estimée", () => {
    const state = withInbound(makeInitialState());
    const inbounder = state.steps[0].ballCarrier;
    const passStep = {
      ...state.steps[0],
      annotations: [
        { type: 'pass' as const, fromId: inbounder, toId: 'O2' as const, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      ] as Annotation[],
      context: 'live-play' as const,
    };
    const extended = {
      ...state,
      secondsPerStep: 4,
      steps: [...state.steps, passStep],
    };
    const diags = computeCoachDiagnostics(extended, 0);
    const ok = diags.find((d) => d.tag === 'inbound-5s-info');
    expect(ok).toBeDefined();
    expect(ok?.message).toContain('4.0s'); // 1 × 4s
  });
});
