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
  it('récupère le brouillon précédent après remplacement et rechargement', () => {
    const { result, unmount } = renderHook(() => useAppState());
    act(() => result.current.patch({ playerNames: { O1: 'Brouillon coach' } }));
    act(() => result.current.resetAll());
    expect(result.current.hasRecovery).toBe(true);
    unmount();
    const reopened = renderHook(() => useAppState());
    expect(reopened.result.current.hasRecovery).toBe(true);
    act(() => reopened.result.current.restoreDraft());
    expect(reopened.result.current.state.playerNames?.O1).toBe('Brouillon coach');
    reopened.unmount();
  });

});
