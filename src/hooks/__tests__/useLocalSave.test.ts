// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocalSave } from '../useLocalSave';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('sauvegarde locale', () => {
  it('attend l’hydratation et conserve le dernier changement avant fermeture', () => {
    vi.useFakeTimers();
    const save = vi.fn(() => true);
    const { result, rerender } = renderHook(({ value, ready }) => useLocalSave(value, ready, save),
      { initialProps: { value: 0, ready: false } });
    act(() => vi.advanceTimersByTime(500));
    expect(save).not.toHaveBeenCalled();
    rerender({ value: 1, ready: true });
    rerender({ value: 2, ready: true });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(save).toHaveBeenLastCalledWith(2);
    expect(result.current).toBe('saved');
  });

  it('signale le quota dépassé et protège la fermeture tant que l’écriture échoue', () => {
    vi.useFakeTimers();
    const save = vi.fn(() => false);
    const { result } = renderHook(() => useLocalSave('travail', true, save));
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('error');
    const leave = new Event('beforeunload', { cancelable: true });
    act(() => window.dispatchEvent(leave));
    expect(leave.defaultPrevented).toBe(true);
    save.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(result.current).toBe('saved');
  });
});
