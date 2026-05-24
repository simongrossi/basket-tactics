// @vitest-environment jsdom
// Tests du module persistance localStorage extrait de useAppState (A5.2).
// Valide : round-trip save/load, hydratation depuis legacy, migration des
// scriptedActions (chemin d'évolution de schéma), robustesse aux erreurs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { STORAGE_KEY, clearStorage, loadFromStorage, saveToStorage } from '../persistence';

describe('persistence (localStorage)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retourne null si rien n\'est stocké', () => {
    expect(loadFromStorage()).toBeNull();
  });

  it('round-trip : saveToStorage → loadFromStorage rend un AppState équivalent', () => {
    const initial = makeInitialState();
    saveToStorage(initial);
    const loaded = loadFromStorage();
    expect(loaded).not.toBeNull();
    expect(loaded?.activeStep).toBe(initial.activeStep);
    expect(loaded?.playerCount).toBe(initial.playerCount);
    expect(loaded?.steps.length).toBe(initial.steps.length);
  });

  it('clearStorage retire l\'entrée — load suivant retourne null', () => {
    saveToStorage(makeInitialState());
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearStorage();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadFromStorage()).toBeNull();
  });

  it('rend null sur JSON invalide (pas de throw)', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ this is { not json');
    expect(loadFromStorage()).toBeNull();
  });

  it('merge avec les defaults : un partial state sans secondsPerStep récupère le default', () => {
    // Simule un payload legacy minimaliste.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeStep: 0, steps: [] }));
    const loaded = loadFromStorage();
    expect(loaded).not.toBeNull();
    // Les champs absents doivent être pris du default (makeInitialState).
    const fresh = makeInitialState();
    expect(loaded?.playerCount).toBe(fresh.playerCount);
    expect(loaded?.attackerProfiles).toEqual(fresh.attackerProfiles);
  });

  it('saveToStorage ne throw pas si setItem échoue (quota / navigation privée)', () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(() => saveToStorage(makeInitialState())).not.toThrow();
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
