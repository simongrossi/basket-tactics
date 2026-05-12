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

function offBallDoubleStep(primaryQuality: number = 0, secondQuality: number = 100): Step {
  return {
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 220, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 170, y: 405 },
      O5: { x: 230, y: 405 },
    },
    ballCarrier: 'O1',
    annotations: [
      {
        type: 'screen',
        fromId: 'O4',
        toId: 'O2',
        from: { x: 170, y: 405 },
        to: { x: 170, y: 405 },
        quality: primaryQuality,
      } as Annotation,
      {
        type: 'screen',
        fromId: 'O5',
        toId: 'O2',
        from: { x: 230, y: 405 },
        to: { x: 230, y: 405 },
        quality: secondQuality,
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

  it('garde les deux poseurs comme obstacles sur un écran off-ball double', () => {
    const step = offBallDoubleStep(0, 100);
    const def: DefenderPositions = {
      ...DEF,
      D2: { x: 190, y: 405 },
      D4: { x: 170, y: 430 },
      D5: { x: 230, y: 430 },
    };
    const ctx = detectScreenContext({
      off: step.off,
      carrier: 'O1',
      matchups: baseMatchups,
      defenderPositions: def,
      screenRadius: 80,
    });
    const screen = ctx.offBallScreens.find((s) => s.cutter === 'O2');
    expect(screen?.type).toBe('stagger');
    expect(screen?.secondScreener).toBe('O5');

    const obstacles = buildSegmentScreenObstacles(ctx, ctx, step.off, step.off, def, def);
    const obstacleDefs = obstacles.map((o) => o.defenderToSkip);
    expect(obstacleDefs).toContain('D4');
    expect(obstacleDefs).toContain('D5');
  });

  it('calcule la mémoire de contact off-ball avec la meilleure qualité du double écran', () => {
    const step = offBallDoubleStep(0, 100);
    const def: DefenderPositions = {
      ...DEF,
      D2: { x: 190, y: 405 },
      D4: { x: 170, y: 430 },
      D5: { x: 230, y: 430 },
    };
    const state = {
      ...makeInitialState(),
      steps: [step],
      offBallScreenRule: 'under',
    } as AppState;
    const ctxB = detectScreenContext({
      off: step.off,
      carrier: 'O1',
      matchups: baseMatchups,
      defenderPositions: def,
      screenRadius: 80,
    });

    const contact = defenderScreenContact({
      state,
      defenderId: 'D2',
      isCarrierDef: false,
      ctxA: emptyScreenContext(),
      ctxB,
      idxA: 0,
      idxB: 0,
    });

    expect(screenQualityByDef(ctxB, [step]).D2).toBe(100);
    expect(contact.mode).toBe('arriving');
    expect(contact.offBallContact?.secondScreener).toBe('O5');
    expect(contact.quality).toBe(100);
  });

  it('ignore les annotations screen ghost pour le lock utilisateur', () => {
    expect(hasCarrierScreenAnnotation(screenStep(0), 'O1')).toBe(false);
    expect(hasCarrierScreenAnnotation(screenStep(10), 'O1')).toBe(true);
  });
});
