import { describe, it, expect } from 'vitest';
import { driveContainmentRule } from '../rules/driveContainment';
import type { RuleContext } from '../types';

const hoop = { x: 250, y: 90 };

function makeCtx(over: Partial<RuleContext>): RuleContext {
  return {
    state: { driveContainmentEnabled: true, defenseMaxSpeed: 10, playerCount: 5, steps: [
      { off: { O1: { x: 250, y: 450 } } },
      { off: { O1: { x: 250, y: 400 } } },
    ] },
    stepIdx: 1,
    off: { O1: { x: 250, y: 400 } },
    carrier: 'O1',
    carrierPos: { x: 250, y: 400 },
    defPos: { D1: { x: 250, y: 250, isCarrierDefender: true, matchedTo: 'O1' } },
    defenderIds: ['D1'],
    hoop,
    ...over,
  } as any;
}

describe('driveContainmentRule', () => {
  it('flag off → aucun diagnostic', () => {
    const out = driveContainmentRule(
      makeCtx({ state: { driveContainmentEnabled: false, defenseMaxSpeed: 10, playerCount: 5,
        steps: [{ off: { O1: { x: 250, y: 450 } } }, { off: { O1: { x: 250, y: 400 } } }] } as any }),
    );
    expect(out).toEqual([]);
  });

  it('drive contenu (défenseur sur la ligne devant) → message "contenu"', () => {
    const out = driveContainmentRule(makeCtx({}));
    expect(out).toHaveLength(1);
    expect(out[0].tag).toBe('drive-contained');
    expect(out[0].message).toContain('contenu');
  });

  it('drive ouvert (défenseur battu derrière) → message "ligne ouverte"', () => {
    const out = driveContainmentRule(
      makeCtx({ defPos: { D1: { x: 250, y: 470, isCarrierDefender: true, matchedTo: 'O1' } } as any }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].tag).toBe('drive-open');
    expect(out[0].message).toContain('ligne ouverte');
  });

  it('pas de drive → aucun diagnostic', () => {
    const out = driveContainmentRule(
      makeCtx({ state: { driveContainmentEnabled: true, defenseMaxSpeed: 10, playerCount: 5,
        steps: [{ off: { O1: { x: 250, y: 400 } } }, { off: { O1: { x: 250, y: 400 } } }] } as any }),
    );
    expect(out).toEqual([]);
  });
});
