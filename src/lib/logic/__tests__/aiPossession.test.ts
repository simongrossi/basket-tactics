import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import {
  generateAiMatchSeries,
  generateAiPossessionPlan,
} from '@/lib/logic/match/aiPossession';

describe('generateAiPossessionPlan', () => {
  it('génère une possession chargeable dans la timeline', () => {
    const state = makeInitialState();
    const plan = generateAiPossessionPlan(state, { seed: 42 }, 1);

    expect(plan.outcome).not.toBe('empty');
    expect(plan.events.length).toBeGreaterThan(0);
    expect(plan.steps.length).toBeGreaterThan(state.steps.length);
    expect(plan.generatedStartIndex).toBe(state.activeStep);

    for (const step of plan.steps) {
      expect(step.off[step.ballCarrier]).toBeDefined();
    }

    const loadedState = {
      ...state,
      steps: plan.steps,
      activeStep: plan.steps.length - 1,
    };
    expect(() => effectiveDefensePositions(loadedState, loadedState.activeStep)).not.toThrow();
  });

  it('conserve le préfixe de scénario quand l’IA part d’une étape active', () => {
    const state = makeInitialState();
    const second = structuredClone(state.steps[0]);
    second.label = 'Setup utilisateur';
    second.off.O1 = { x: 280, y: 420 };
    state.steps = [state.steps[0], second];
    state.activeStep = 1;

    const plan = generateAiPossessionPlan(state, { seed: 7 }, 1);

    expect(plan.generatedStartIndex).toBe(1);
    expect(plan.steps[0]).toEqual(state.steps[0]);
    expect(plan.steps[1].label).toBe('Setup utilisateur');
    expect(plan.steps.length).toBeGreaterThan(2);
  });
});

describe('generateAiMatchSeries', () => {
  it('est reproductible avec un seed fixe', () => {
    const state = makeInitialState();

    const a = generateAiMatchSeries(state, { possessions: 3, seed: 1234 });
    const b = generateAiMatchSeries(state, { possessions: 3, seed: 1234 });

    expect(a.summary).toEqual(b.summary);
    expect(a.plans.map((p) => p.outcome)).toEqual(b.plans.map((p) => p.outcome));
    expect(a.plans.map((p) => p.events.map((e) => e.label))).toEqual(
      b.plans.map((p) => p.events.map((e) => e.label)),
    );
  });
});
