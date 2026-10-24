// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
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

function renderStepsPanel(state: AppState, overrides: Partial<ComponentProps<typeof StepsPanel>> = {}) {
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
    onSetAnnotationFlipSide: vi.fn(),
    onAddFeinte: vi.fn(),
    onUpdateFeinte: vi.fn(),
    onRemoveFeinte: vi.fn(),
    ...overrides,
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

  it('« + étape » après une action : ligne Position finale, comme la timeline', () => {
    const initial = makeInitialState();
    const state = addStep(addAnnotation(initial, cutAnnotation(initial)));

    const { container, getByTestId } = renderStepsPanel(state);
    expect(container.textContent).toContain('#1');
    expect(container.textContent).not.toContain('#2');
    expect(getByTestId('final-position-row').textContent).toContain('deviendra l’étape 2');
  });

  it('pas de ligne Position finale quand on édite une étape numérotée', () => {
    const initial = makeInitialState();
    const state = addAnnotation(initial, cutAnnotation(initial));

    const { queryByTestId } = renderStepsPanel(state);
    expect(queryByTestId('final-position-row')).toBeNull();
  });

  it('monte l’étape active après confirmation quand des trajectoires existent', () => {
    const initial = makeInitialState();
    const baseOff = initial.steps[0].off;
    const steps = [0, 1, 2].map((k) => ({
      ...initial.steps[0],
      off: Object.fromEntries(
        Object.entries(baseOff).map(([id, p]) => [id, { x: p.x + k * 20, y: p.y }]),
      ) as typeof baseOff,
      label: `Étape ${k + 1}`,
      annotations: k === 0
        ? [{ type: 'cut' as const, fromId: 'O2' as const, from: { ...baseOff.O2 }, to: { x: baseOff.O2.x + 10, y: baseOff.O2.y } }]
        : [],
    }));
    const state: AppState = { ...initial, steps, activeStep: 1 };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onMoveStep = vi.fn();

    const { getByRole } = renderStepsPanel(state, { onMoveStep });
    fireEvent.click(getByRole('button', { name: "Monter l'étape" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onMoveStep).toHaveBeenCalledWith(-1);
    confirmSpy.mockRestore();
  });

  it('désactive la réorganisation quand la séquence est lissée', () => {
    const initial = makeInitialState();
    const steps = [0, 1, 2].map((k) => ({
      ...initial.steps[0],
      off: Object.fromEntries(
        Object.entries(initial.steps[0].off).map(([id, p]) => [id, { x: p.x + k * 20, y: p.y }]),
      ) as typeof initial.steps[0]['off'],
      label: `Étape ${k + 1}`,
    }));
    steps[0].isInterpolated = true;
    const state: AppState = { ...initial, steps, activeStep: 1 };

    const { getByRole } = renderStepsPanel(state, { onMoveStep: vi.fn() });
    expect((getByRole('button', { name: "Monter l'étape" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
