// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { Annotation, AppState } from '@/lib/types';
import { addAnnotation } from '@/lib/state/transforms/annotationTransforms';
import { addStep } from '@/lib/state/transforms/stepTransforms';
import { StepsPanel, isPristineInitialStepList } from '../StepsPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderStepsPanel(state: AppState) {
  const props: ComponentProps<typeof StepsPanel> = {
    state,
    onSetActiveStep: vi.fn(),
    onAddStep: vi.fn(),
    onDuplicateStep: vi.fn(),
    onDeleteStep: vi.fn(),
    onSetStepLabel: vi.fn(),
    onPatchStep: vi.fn(),
    onSetBallCarrier: vi.fn(),
    onDeleteAnnotation: vi.fn(),
    onAddFeinte: vi.fn(),
    onUpdateFeinte: vi.fn(),
    onRemoveFeinte: vi.fn(),
  };
  return render(createElement(StepsPanel, props));
}

function cutAnnotation(state: AppState): Annotation {
  const step = state.steps[state.activeStep];
  return {
    type: 'cut',
    fromId: 'O2',
    toId: null,
    from: { ...step.off.O2 },
    to: { x: step.off.O2.x + 24, y: step.off.O2.y - 16 },
  };
}

describe('StepsPanel', () => {
  it("n'affiche pas #1 sur le placement initial vierge", () => {
    const state = makeInitialState();

    expect(isPristineInitialStepList(state)).toBe(true);

    const { container, getByText } = renderStepsPanel(state);
    expect(getByText('Aucune étape')).toBeTruthy();
    expect(container.textContent).not.toContain('#1');
  });

  it("affiche #1 dès qu'une action existe", () => {
    const initial = makeInitialState();
    const state = addAnnotation(initial, cutAnnotation(initial));

    expect(isPristineInitialStepList(state)).toBe(false);

    const { container } = renderStepsPanel(state);
    expect(container.textContent).toContain('#1');
    expect(container.textContent).not.toContain('#2');
    expect(container.textContent).not.toContain('Aucune étape');
  });

  it("affiche seulement #1 après ajout manuel d'une étape", () => {
    const state = addStep(makeInitialState());

    expect(isPristineInitialStepList(state)).toBe(false);

    const { container } = renderStepsPanel(state);
    expect(container.textContent).toContain('#1');
    expect(container.textContent).not.toContain('#2');
    expect(container.textContent).not.toContain('Aucune étape');
  });
});
