// @vitest-environment jsdom
// Tests du hook useHistorizedState (extrait de useAppState).
// Couvre : setStateRaw (sans history), setStateWithHistory, undo/redo,
// drag coalescing (begin/commit collapse en 1 entrée d'history).

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { useHistorizedState } from '../useHistorizedState';

function patch(s: AppState, patchObj: Partial<AppState>): AppState {
  return { ...s, ...patchObj };
}

describe('useHistorizedState', () => {
  it('initialise via le callback fourni', () => {
    const { result } = renderHook(() => useHistorizedState(makeInitialState));
    expect(result.current.state.activeStep).toBe(0);
    expect(result.current.state.steps.length).toBeGreaterThan(0);
  });

  it('setStateWithHistory permet undo/redo', () => {
    const { result } = renderHook(() => useHistorizedState(makeInitialState));
    const initialActiveStep = result.current.state.activeStep;

    act(() => {
      result.current.setStateWithHistory((s) => patch(s, { activeStep: 5 }));
    });
    expect(result.current.state.activeStep).toBe(5);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.activeStep).toBe(initialActiveStep);

    act(() => {
      result.current.redo();
    });
    expect(result.current.state.activeStep).toBe(5);
  });

  it("setStateRaw ne pousse PAS d'historique (undo après ne fait rien)", () => {
    const { result } = renderHook(() => useHistorizedState(makeInitialState));
    const initial = result.current.state;

    act(() => {
      result.current.setStateRaw((s) => patch(s, { activeStep: 3 }));
    });
    expect(result.current.state.activeStep).toBe(3);

    act(() => {
      result.current.undo();
    });
    // Pas d'entrée poussée → undo no-op → l'état reste à 3.
    expect(result.current.state.activeStep).toBe(3);
    // initial inchangé (référentiel).
    expect(initial.activeStep).not.toBe(3);
  });

  it('begin/commit drag collapse N updates en 1 entrée d\'historique', () => {
    const { result } = renderHook(() => useHistorizedState(makeInitialState));
    const initialActiveStep = result.current.state.activeStep;

    act(() => {
      result.current.beginPlayerDrag();
    });
    // Plusieurs mises à jour pendant le drag, AUCUNE ne doit pousser d'entrée.
    act(() => {
      result.current.setStateRaw((s) => patch(s, { activeStep: 1 }));
    });
    act(() => {
      result.current.setStateRaw((s) => patch(s, { activeStep: 2 }));
    });
    act(() => {
      result.current.setStateRaw((s) => patch(s, { activeStep: 3 }));
    });
    act(() => {
      result.current.commitPlayerDrag();
    });
    expect(result.current.state.activeStep).toBe(3);

    // Un seul undo doit ramener à l'anchor (= état avant beginDrag).
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.activeStep).toBe(initialActiveStep);
  });

  it("commit sans begin est un no-op (anchor null)", () => {
    const { result } = renderHook(() => useHistorizedState(makeInitialState));
    expect(() => {
      act(() => {
        result.current.commitPlayerDrag();
      });
    }).not.toThrow();
  });

  it("stateRef.current reflète toujours l'état courant", () => {
    const { result } = renderHook(() => useHistorizedState(makeInitialState));
    act(() => {
      result.current.setStateWithHistory((s) => patch(s, { activeStep: 7 }));
    });
    expect(result.current.stateRef.current.activeStep).toBe(7);
  });
});
