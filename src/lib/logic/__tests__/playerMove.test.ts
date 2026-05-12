import { describe, expect, it } from 'vitest';
import { makeInitialState, makeStep, initialOff } from '@/lib/data/initial';
import type { AppState, Step } from '@/lib/types';
import { moveAttackerInState, moveDefenderInState } from '../playerMove';

describe('playerMove — mutations de drag pures', () => {
  it('ne recrée pas de state si la position attaquant ne change pas', () => {
    const state = makeInitialState();
    const next = moveAttackerInState(state, 'O1', state.steps[0].off.O1);
    expect(next).toBe(state);
  });

  it('déplace un attaquant et marque un step généré comme override manuel', () => {
    const state = {
      ...makeInitialState(),
      steps: [
        makeStep(initialOff, 'O1', []),
        {
          ...makeStep({ ...initialOff, O2: { x: 150, y: 360 } }, 'O1', []),
          generatedBy: 'action-1',
        } as Step,
      ],
      activeStep: 1,
    } as AppState;

    const next = moveAttackerInState(state, 'O2', { x: 180, y: 340 });

    expect(next).not.toBe(state);
    expect(next.steps[1].off.O2).toEqual({ x: 180, y: 340 });
    expect(next.steps[1].manualOverride).toBe(true);
    expect(next.steps[0].annotations[0]).toMatchObject({
      type: 'cut',
      fromId: 'O2',
      to: { x: 180, y: 340 },
    });
  });

  it('déplace un défenseur en man et synchronise defenseInitial au step 0', () => {
    const state = makeInitialState();
    const next = moveDefenderInState(state, 'D1', { x: 310, y: 390 });

    expect(next.steps[0].defenseOverrides?.D1).toEqual({ x: 310, y: 390 });
    expect(next.defenseInitial.D1).toEqual({ x: 310, y: 390 });
  });

  it('en édition zone, déplace le homePos de région sans créer defenseOverride', () => {
    const state = {
      ...makeInitialState(),
      defenseSystem: 'zone',
      zoneEditMode: true,
    } as AppState;

    const next = moveDefenderInState(state, 'D1', { x: 240.4, y: 280.6 });

    expect(next.steps[0].defenseOverrides).toBeUndefined();
    expect(next.zoneOverrides?.['guard-left']?.homePos).toEqual({ x: 240, y: 281 });
  });
});
