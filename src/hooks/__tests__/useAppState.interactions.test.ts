// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppState } from '../useAppState';

describe('useAppState interactions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('coalesce plusieurs updates de drag en une seule entree undo', () => {
    const { result } = renderHook(() => useAppState());
    const start = result.current.state.steps[0].off.O1;
    const end = { x: 330, y: 440 };

    act(() => {
      result.current.beginPlayerDrag();
      result.current.moveAttackerDuringDrag('O1', 310, 460);
      result.current.moveAttackerDuringDrag('O1', 320, 450);
      result.current.moveAttackerDuringDrag('O1', end.x, end.y);
      result.current.commitPlayerDrag();
    });

    expect(result.current.state.steps[0].off.O1).toEqual(end);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.steps[0].off.O1).toEqual(start);

    act(() => {
      result.current.redo();
    });
    expect(result.current.state.steps[0].off.O1).toEqual(end);
  });
  it('U03 — canUndo/canRedo suivent la pile, y compris après un drag coalescé', () => {
    const { result } = renderHook(() => useAppState());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.beginPlayerDrag();
      result.current.moveAttackerDuringDrag('O1', 320, 450);
      result.current.commitPlayerDrag();
    });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('U03 — naviguer entre étapes ne remplit pas l’historique', () => {
    const { result } = renderHook(() => useAppState());
    act(() => result.current.addStep());
    const edited = result.current.state;
    act(() => result.current.setActiveStep(0));
    act(() => result.current.setActiveStep(1));
    act(() => result.current.setActiveStep(0));
    // Annuler revient sur la vraie modification (l'ajout d'étape).
    act(() => result.current.undo());
    expect(result.current.state.steps).toHaveLength(edited.steps.length - 1);
    expect(result.current.canUndo).toBe(false);
  });

  it('U03 — sélectionner l’étape déjà active ne change pas l’état', () => {
    const { result } = renderHook(() => useAppState());
    const before = result.current.state;
    act(() => result.current.setActiveStep(before.activeStep));
    expect(result.current.state).toBe(before);
  });

  it('récupère le brouillon précédent après remplacement et rechargement', () => {
    const { result, unmount } = renderHook(() => useAppState());
    act(() => result.current.patch({ playerNames: { O1: 'Brouillon coach' } }));
    act(() => { expect(result.current.resetAll()).toBe(true); });
    expect(result.current.hasRecovery).toBe(true);
    unmount();
    const reopened = renderHook(() => useAppState());
    expect(reopened.result.current.hasRecovery).toBe(true);
    act(() => reopened.result.current.restoreDraft());
    expect(reopened.result.current.state.playerNames?.O1).toBe('Brouillon coach');
    reopened.unmount();
  });

  it('refuse de créer un système si le brouillon ne peut pas être protégé', () => {
    const { result, unmount } = renderHook(() => useAppState());
    const before = result.current.state;
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    try {
      act(() => { expect(result.current.resetAll()).toBe(false); });
      expect(result.current.state).toBe(before);
      expect(alert).toHaveBeenCalled();
    } finally {
      storage.mockRestore();
      alert.mockRestore();
      unmount();
    }
  });

});
