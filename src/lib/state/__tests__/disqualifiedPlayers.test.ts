// Tests F.4 — pénalité technique / disqualification de joueur.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  togglePlayerDisqualified,
  clearDisqualified,
} from '../transforms/coreTransforms';

describe('togglePlayerDisqualified', () => {
  it("ajoute un joueur à la liste DQ s'il n'y est pas", () => {
    const s = makeInitialState();
    const result = togglePlayerDisqualified(s, 'O3');
    expect(result.disqualifiedPlayers).toEqual(['O3']);
  });

  it("retire un joueur de la liste DQ s'il y est déjà (toggle off)", () => {
    const s = makeInitialState();
    const dqed = togglePlayerDisqualified(s, 'D2');
    expect(dqed.disqualifiedPlayers).toEqual(['D2']);
    const cleared = togglePlayerDisqualified(dqed, 'D2');
    expect(cleared.disqualifiedPlayers).toBeUndefined();
  });

  it("supporte plusieurs joueurs DQ simultanément", () => {
    let s = makeInitialState();
    s = togglePlayerDisqualified(s, 'O1');
    s = togglePlayerDisqualified(s, 'D5');
    s = togglePlayerDisqualified(s, 'O3');
    expect(s.disqualifiedPlayers).toEqual(['O1', 'D5', 'O3']);
  });
});

describe('clearDisqualified', () => {
  it('vide la liste DQ', () => {
    let s = makeInitialState();
    s = togglePlayerDisqualified(s, 'O1');
    s = togglePlayerDisqualified(s, 'D2');
    expect(s.disqualifiedPlayers).toEqual(['O1', 'D2']);
    s = clearDisqualified(s);
    expect(s.disqualifiedPlayers).toBeUndefined();
  });

  it('no-op si liste déjà vide', () => {
    const s = makeInitialState();
    const result = clearDisqualified(s);
    expect(result.disqualifiedPlayers).toBeUndefined();
  });
});
