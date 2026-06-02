import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { detectBlitzRelease } from '@/lib/logic/defense/detectBlitzRelease';

/** Step 0 : PnR blitz O5→O1 (porteur O1). Step 1 : ballon ressort vers O3. */
function makeBlitzThenPassState(opts: { passOut: boolean; rule?: 'blitz' | 'hedge' }): AppState {
  const s0 = makeInitialState();
  const baseOff = { ...s0.steps[0].off };
  return {
    ...s0,
    screenRule: opts.rule ?? 'blitz',
    steps: [
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 380 } }, // O5 plaqué sur D1
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 300 } }, // O5 roll
        ballCarrier: opts.passOut ? 'O3' : 'O1', // passe sortie ou non
      },
    ],
  };
}

describe('detectBlitzRelease', () => {
  it('blitz N-1 + ballon ressort à N → release détecté', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: true }), 1);
    expect(r).not.toBeNull();
    expect(r!.rollerId).toBe('O5');         // le poseur devient roller
    expect(r!.formerCarrierId).toBe('O1');  // l'ancien porteur
  });

  it('blitz N-1 mais ballon PAS ressorti (carrier inchangé) → null', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: false }), 1);
    expect(r).toBeNull();
  });

  it('pas de blitz à N-1 (hedge) → null', () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: true, rule: 'hedge' }), 1);
    expect(r).toBeNull();
  });

  it("step 0 → null (pas d'historique)", () => {
    const r = detectBlitzRelease(makeBlitzThenPassState({ passOut: true }), 0);
    expect(r).toBeNull();
  });
});
