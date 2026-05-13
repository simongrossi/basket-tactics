// @vitest-environment jsdom
// Livraison 2 — tests du hook useAccordionState.

import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccordionState } from '../useAccordionState';

const STORAGE_KEY = 'basket-tactics:accordion-state-v1';

describe('useAccordionState', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('retourne defaultOpen si rien en localStorage', () => {
    const { result } = renderHook(() => useAccordionState('test-section', true));
    expect(result.current[0]).toBe(true);
  });

  it('retourne false par défaut si defaultOpen=false', () => {
    const { result } = renderHook(() => useAccordionState('test-section', false));
    expect(result.current[0]).toBe(false);
  });

  it('persiste la valeur dans localStorage après set', () => {
    const { result } = renderHook(() => useAccordionState('persist-section', false));
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored['persist-section']).toBe(true);
  });

  it('lit la valeur stockée pour un id donné', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'existing-id': false }));
    const { result } = renderHook(() => useAccordionState('existing-id', true));
    expect(result.current[0]).toBe(false); // stockée prend le pas sur defaultOpen
  });

  it('gère 2 sections indépendantes via id différent', () => {
    const { result: r1 } = renderHook(() => useAccordionState('section-A', false));
    const { result: r2 } = renderHook(() => useAccordionState('section-B', false));

    act(() => {
      r1.current[1](true);
    });

    expect(r1.current[0]).toBe(true);
    expect(r2.current[0]).toBe(false);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored['section-A']).toBe(true);
    expect(stored['section-B']).toBeUndefined();
  });

  it('fallback gracefully si JSON corrompu', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    const { result } = renderHook(() => useAccordionState('safe-section', true));
    expect(result.current[0]).toBe(true); // utilise default
  });

  it("fallback gracefully si la valeur stockée n'est pas un objet", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify('a string'));
    const { result } = renderHook(() => useAccordionState('safe-section', false));
    expect(result.current[0]).toBe(false);
  });
});
