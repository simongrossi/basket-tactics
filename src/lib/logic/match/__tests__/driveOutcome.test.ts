// 2b.1 — décideur pur d'issue de drive (spec 2026-06-03-drive-outcomes-matchsim).
//
// Mapping : beaten → continue · contained → pullup · walled → strip (proba
// STRIP_PROBABILITY) sinon kickout.

import { describe, expect, it } from 'vitest';
import {
  resolveDriveOutcome,
  STRIP_PROBABILITY,
} from '../decisions/driveOutcome';

describe('resolveDriveOutcome — mapping ContainmentLevel → DriveOutcome', () => {
  it("beaten → continue (le défenseur est battu, le drive va au cercle)", () => {
    expect(resolveDriveOutcome('beaten', () => 0.5)).toBe('continue');
  });

  it('contained → pullup (la ligne est coupée, le porteur s’arrête en pull-up)', () => {
    expect(resolveDriveOutcome('contained', () => 0.5)).toBe('pullup');
  });

  it('walled + rng sous STRIP_PROBABILITY → strip (ballon arraché)', () => {
    expect(resolveDriveOutcome('walled', () => 0.05)).toBe('strip');
  });

  it('walled + rng au-dessus de STRIP_PROBABILITY → kickout', () => {
    expect(resolveDriveOutcome('walled', () => 0.9)).toBe('kickout');
  });

  it('STRIP_PROBABILITY exportée et calibrable (0 < p < 1)', () => {
    expect(STRIP_PROBABILITY).toBeGreaterThan(0);
    expect(STRIP_PROBABILITY).toBeLessThan(1);
  });

  it('la RNG n’est consommée que sur walled (déterminisme des autres branches)', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return 0.5;
    };
    resolveDriveOutcome('beaten', rng);
    resolveDriveOutcome('contained', rng);
    expect(calls).toBe(0);
    resolveDriveOutcome('walled', rng);
    expect(calls).toBe(1);
  });
});
