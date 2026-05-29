// Tests L.3 — résolution aide (drive-and-kick) + deny (backdoor).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { HOOP } from '@/lib/data/court';
import { classifyHelpOrigin, resolveHelpSource, resolveDeny } from '../resolveHelp';

describe('classifyHelpOrigin (pur)', () => {
  it('homme libéré près du panier → low', () => {
    expect(classifyHelpOrigin({ x: 450, y: 300 }, { x: 300, y: 150 }, HOOP)).toBe('low');
  });

  it('homme libéré du même côté que le ballon → strong', () => {
    // Ballon à droite (x>300), homme libéré à droite, loin du panier.
    expect(classifyHelpOrigin({ x: 450, y: 300 }, { x: 480, y: 300 }, HOOP)).toBe('strong');
  });

  it('homme libéré côté opposé au ballon → weak', () => {
    // Ballon à droite, homme libéré à gauche → skip côté faible.
    expect(classifyHelpOrigin({ x: 450, y: 300 }, { x: 120, y: 300 }, HOOP)).toBe('weak');
  });

  it('homme libéré pile dans l\'axe → strong (kick court)', () => {
    expect(classifyHelpOrigin({ x: 450, y: 300 }, { x: 300, y: 320 }, HOOP)).toBe('strong');
  });
});

/** État étalé statique : aucun drive, aucune aide active attendue. */
function makeStaticState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 400 },
    O2: { x: 80, y: 360 },
    O3: { x: 520, y: 360 },
    O4: { x: 120, y: 200 },
    O5: { x: 480, y: 200 },
  };
  return {
    ...s0,
    steps: [makeStep(off, 'O1', []), makeStep(off, 'O1', [])],
    activeStep: 1,
    ...overrides,
  };
}

describe('resolveHelpSource — garde-fous', () => {
  it('null sans aide déclenchée (jeu statique étalé)', () => {
    expect(resolveHelpSource(makeStaticState(), 1)).toBeNull();
  });

  it('null en défense non-man', () => {
    expect(resolveHelpSource(makeStaticState({ defenseSystem: 'zone' }), 1)).toBeNull();
  });

  it('null pour un index hors bornes', () => {
    const s = makeStaticState();
    expect(resolveHelpSource(s, -1)).toBeNull();
    expect(resolveHelpSource(s, 99)).toBeNull();
  });
});

describe('resolveDeny — garde-fous', () => {
  it('false quand le défenseur du receveur ne dénie pas', () => {
    expect(resolveDeny(makeStaticState(), 1, 'O2')).toBe(false);
  });

  it('false en défense non-man', () => {
    expect(resolveDeny(makeStaticState({ defenseSystem: 'zone' }), 1, 'O2')).toBe(false);
  });

  it('false pour un index hors bornes', () => {
    expect(resolveDeny(makeStaticState(), 99, 'O2')).toBe(false);
  });
});
