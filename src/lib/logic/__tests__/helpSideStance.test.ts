import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { computeDefenseTargets } from '@/lib/logic/engine';

const HOOP_X = 300;

/**
 * P1.1 — câblage state.helpSideStanceEnabled → baseTargets → computeHelpTarget.
 * Ballon côté droit (O1 porteur), O2 weak-side gauche à DEUX passes du ballon
 * (> 250 px). Son défenseur D2 doit prendre la stance split line quand le flag
 * est actif, et garder le sag legacy sinon.
 */
function makeSplitState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    helpSideStanceEnabled: enabled || undefined,
    steps: [
      {
        ...s0.steps[0],
        off: {
          O1: { x: 450, y: 400 }, // porteur, strong-side droit
          O2: { x: 100, y: 340 }, // weak-side, ~355 px du ballon = 2 passes
          O3: { x: 480, y: 250 }, // strong-side
          O4: { x: 150, y: 150 }, // weak-side bas
          O5: { x: 400, y: 130 }, // strong-side bas
        },
        ballCarrier: 'O1',
      },
    ],
  };
}

describe('helpSideStanceEnabled — intégration pipeline man', () => {
  it('flag off (default) → D2 garde le sag weak-side legacy', () => {
    const { positions } = computeDefenseTargets(makeSplitState(false), 0);
    expect(positions.D2.helpKind).toBe('sag-weakside');
  });

  it('flag on → D2 (homme à 2 passes) passe en stance split line', () => {
    const { positions } = computeDefenseTargets(makeSplitState(true), 0);
    expect(positions.D2.helpKind).toBe('helpside-splitline');
  });

  it('flag on → D2 est plus proche de la split line que le sag legacy', () => {
    const legacy = computeDefenseTargets(makeSplitState(false), 0).positions;
    const split = computeDefenseTargets(makeSplitState(true), 0).positions;
    const dLegacy = Math.abs(legacy.D2.x - HOOP_X);
    const dSplit = Math.abs(split.D2.x - HOOP_X);
    expect(dSplit).toBeLessThan(dLegacy);
  });
});
