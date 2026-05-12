import { describe, expect, it } from 'vitest';
import type { Annotation, AppState, DefenderPositions, Step } from '@/lib/types';
import { baseMatchups, makeInitialState } from '@/lib/data/initial';
import {
  buildSegmentScreenObstacles,
  defenderScreenContact,
  detectScreenContext,
  emptyScreenContext,
  hasCarrierScreenAnnotation,
  screenQualityByDef,
} from '../screenContext';

function screenStep(quality: number = 80): Step {
  return {
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 320, y: 460 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations: [
      {
        type: 'screen',
        fromId: 'O3',
        toId: 'O1',
        from: { x: 470, y: 380 },
        to: { x: 320, y: 460 },
        quality,
      } as Annotation,
    ],
  };
}

const DEF: DefenderPositions = {
  D1: { x: 300, y: 460 },
  D2: { x: 130, y: 370 },
  D3: { x: 460, y: 370 },
  D4: { x: 220, y: 220 },
  D5: { x: 380, y: 220 },
};

describe('screenContext', () => {
  it('détecte écran porteur et expose la qualité par défenseur', () => {
    const step = screenStep(80);
    const ctx = detectScreenContext({
      off: step.off,
      carrier: 'O1',
      matchups: baseMatchups,
      defenderPositions: DEF,
      screenRadius: 120,
      forcedScreener: step.forcedScreener,
    });

    expect(ctx.screen?.screener).toBe('O3');
    expect(ctx.screen?.carrierDef).toBe('D1');
    expect(screenQualityByDef(ctx, [step]).D1).toBe(80);
  });

  it('calcule un contact arriving stable entre endpoints', () => {
    const state = {
      ...makeInitialState(),
      steps: [
        { ...screenStep(80), off: { ...screenStep(80).off, O3: { x: 470, y: 380 } } },
        screenStep(80),
      ],
      screenRule: 'hedge',
    } as AppState;
    const ctxA = emptyScreenContext();
    const ctxB = detectScreenContext({
      off: state.steps[1].off,
      carrier: 'O1',
      matchups: baseMatchups,
      defenderPositions: DEF,
      screenRadius: 120,
    });

    const contact = defenderScreenContact({
      state,
      defenderId: 'D1',
      isCarrierDef: true,
      ctxA,
      ctxB,
      idxA: 0,
      idxB: 1,
    });

    expect(contact.mode).toBe('arriving');
    expect(contact.carrierContact).toBe(true);
    expect(contact.quality).toBeGreaterThan(80);
  });

  it('fusionne les obstacles endpoints sans doublonner le même défenseur de poseur', () => {
    const step = screenStep(80);
    const ctx = detectScreenContext({
      off: step.off,
      carrier: 'O1',
      matchups: baseMatchups,
      defenderPositions: DEF,
      screenRadius: 120,
    });
    const obstacles = buildSegmentScreenObstacles(ctx, ctx, step.off, step.off, DEF, DEF);

    expect(obstacles).toHaveLength(1);
    expect(obstacles[0].defenderToSkip).toBe('D3');
  });

  it('ignore les annotations screen ghost pour le lock utilisateur', () => {
    expect(hasCarrierScreenAnnotation(screenStep(0), 'O1')).toBe(false);
    expect(hasCarrierScreenAnnotation(screenStep(10), 'O1')).toBe(true);
  });
});
