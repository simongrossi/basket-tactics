import { describe, it, expect } from 'vitest';
import { resolveRealismFlags, PRESET_REALISTIC } from '../realismProfile';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';

function withProfile(patch: Partial<AppState>): AppState {
  return { ...makeInitialState(), ...patch };
}

describe('resolveRealismFlags', () => {
  it('profil realistic active le groupe cinématique aux valeurs preset', () => {
    const r = resolveRealismFlags(withProfile({ realismProfile: 'realistic' }));
    expect(r.attackerAccelerationEnabled).toBe(true);
    expect(r.attackerAcceleration).toBe(PRESET_REALISTIC.attackerAcceleration);
    expect(r.attackerMomentumEnabled).toBe(true);
    expect(r.attackerMomentum).toBe(PRESET_REALISTIC.attackerMomentum);
    expect(r.attackerVelocityProfileEnabled).toBe(true);
    expect(r.footworkRulesEnabled).toBe(true);
  });

  it('profil realistic : un flag explicitement false est un override qui gagne', () => {
    const r = resolveRealismFlags(
      withProfile({ realismProfile: 'realistic', footworkRulesEnabled: false }),
    );
    expect(r.footworkRulesEnabled).toBe(false);
    expect(r.attackerAccelerationEnabled).toBe(true); // les autres restent preset
  });

  it('profil legacy renvoie les flags bruts', () => {
    const r = resolveRealismFlags(
      withProfile({ realismProfile: 'legacy', attackerAccelerationEnabled: true }),
    );
    expect(r.attackerAccelerationEnabled).toBe(true);
    expect(r.footworkRulesEnabled).toBe(false);
    expect(r.attackerAcceleration).toBe(5.0); // valeur présente dans makeInitialState
  });

  it('profil undefined est bit-identique à legacy', () => {
    const base = withProfile({ attackerMomentumEnabled: true });
    const undef = resolveRealismFlags(base);
    const legacy = resolveRealismFlags({ ...base, realismProfile: 'legacy' });
    expect(undef).toEqual(legacy);
  });

  it('garde-fou : makeInitialState() reste legacy (verrouille les 124 tests)', () => {
    const state = makeInitialState();
    expect(state.realismProfile).toBeUndefined();
    const r = resolveRealismFlags(state);
    expect(r.attackerAccelerationEnabled).toBe(false);
    expect(r.attackerMomentumEnabled).toBe(false);
    expect(r.attackerVelocityProfileEnabled).toBe(false);
    expect(r.footworkRulesEnabled).toBe(false);
  });

  it('profil realistic : réalisme défensif (congestion, départ progressif, poursuite anticipée) actif', () => {
    const r = resolveRealismFlags({ ...makeInitialState(), realismProfile: 'realistic' });
    expect(r.congestionPenaltyEnabled).toBe(true);
    expect(r.defenderPlaybackAccelerationEnabled).toBe(true);
    expect(r.defenderLeadPursuitEnabled).toBe(true);
  });

  it('profil realistic : un coach peut désactiver un comportement défensif', () => {
    const r = resolveRealismFlags({ ...makeInitialState(), realismProfile: 'realistic', congestionPenaltyEnabled: false });
    expect(r.congestionPenaltyEnabled).toBe(false);
    expect(r.defenderPlaybackAccelerationEnabled).toBe(true);
  });

  it('profil legacy : réalisme défensif désactivé sauf opt-in explicite', () => {
    const r = resolveRealismFlags({ ...makeInitialState(), defenderLeadPursuitEnabled: true });
    expect(r.congestionPenaltyEnabled).toBe(false);
    expect(r.defenderPlaybackAccelerationEnabled).toBe(false);
    expect(r.defenderLeadPursuitEnabled).toBe(true);
  });
});
