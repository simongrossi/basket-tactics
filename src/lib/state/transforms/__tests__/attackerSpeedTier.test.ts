import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { setAttackerSpeedTier } from '../attackerTransforms';

describe('setAttackerSpeedTier', () => {
  it('définit le tier d\'un attaquant — initialise le map si absent', () => {
    const s = makeInitialState();
    expect(s.attackerSpeedProfiles).toBeUndefined();
    const out = setAttackerSpeedTier(s, 'O1', 'elite');
    expect(out.attackerSpeedProfiles).toEqual({ O1: 'elite' });
    // état d'entrée non muté
    expect(s.attackerSpeedProfiles).toBeUndefined();
  });

  it('met à jour le tier d\'un attaquant existant sans toucher les autres', () => {
    let s = setAttackerSpeedTier(makeInitialState(), 'O1', 'elite');
    s = setAttackerSpeedTier(s, 'O2', 'lent');
    const out = setAttackerSpeedTier(s, 'O1', 'standard');
    expect(out.attackerSpeedProfiles).toEqual({ O1: 'standard', O2: 'lent' });
  });

  it("undefined → supprime la clé (= 'standard' par défaut)", () => {
    let s = setAttackerSpeedTier(makeInitialState(), 'O1', 'elite');
    s = setAttackerSpeedTier(s, 'O2', 'lent');
    const out = setAttackerSpeedTier(s, 'O1', undefined);
    expect(out.attackerSpeedProfiles).toEqual({ O2: 'lent' });
    expect(out.attackerSpeedProfiles?.O1).toBeUndefined();
  });

  it('undefined sur un attaquant absent — no-op (renvoie un map sans la clé)', () => {
    const s = makeInitialState();
    const out = setAttackerSpeedTier(s, 'O3', undefined);
    expect(out.attackerSpeedProfiles).toEqual({});
  });
});
