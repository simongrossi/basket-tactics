import { describe, it, expect } from 'vitest';
import { compileScenario } from '@/lib/logic/compileScenario';
import type {
  AttackerPositions, OffensiveScriptedAction, DefensiveScriptedAction,
} from '@/lib/types';

const initialOff: AttackerPositions = {
  O1: { x: 300, y: 280 },
  O2: { x: 100, y: 250 },
  O3: { x: 500, y: 250 },
  O4: { x: 200, y: 100 },
  O5: { x: 350, y: 200 },
};

describe('Intégration — PnR + couverture trap', () => {
  it('compile et pose une directive trap sur chaque step du PnR', () => {
    const pnr: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pnr-1', type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5', side: 'fort' },
    };
    const trap: DefensiveScriptedAction = {
      kind: 'defensive', id: 'trap-1', type: 'trap',
      parentActionId: 'pnr-1',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1',
      actions: [pnr, trap],
    });
    // Step 0 = Départ (sans directive). Steps 1..3 = PnR avec trap.
    expect(steps[0].defensiveDirectives).toBeUndefined();
    for (let i = 1; i < steps.length; i++) {
      const dirs = steps[i].defensiveDirectives;
      expect(dirs).toBeDefined();
      expect(dirs!.some((d) => d.type === 'trap' && d.target === 'O1')).toBe(true);
    }
  });

  it('pre-switch propage assignmentOverrides sur tous les steps du parent', () => {
    const pnr: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pnr-1', type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5' },
    };
    const preSwitch: DefensiveScriptedAction = {
      kind: 'defensive', id: 'ps-1', type: 'pre-switch',
      parentActionId: 'pnr-1',
      affectedSteps: [0],
      params: { defenders: ['D1'], swapWith: 'D5' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1',
      actions: [pnr, preSwitch],
    });
    // Tous les steps du PnR (1,2,3) doivent avoir assignmentOverrides
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
    }
  });

  it('action défensive libre s\'applique sur les indices absolus', () => {
    const pnr: OffensiveScriptedAction = {
      kind: 'offensive', id: 'pnr-1', type: 'pick-and-roll',
      params: { ballHandler: 'O1', screener: 'O5' },
    };
    const freeTrap: DefensiveScriptedAction = {
      kind: 'defensive', id: 'free-1', type: 'trap',
      affectedSteps: [2],
      params: { defenders: ['D2', 'D3'], target: 'O1' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1',
      actions: [pnr, freeTrap],
    });
    expect(steps[2].defensiveDirectives?.length).toBeGreaterThan(0);
    expect(steps[2].defensiveDirectives?.some(
      (d) => d.type === 'trap' && d.defenders.includes('D2'),
    )).toBe(true);
    // Step 1 et 3 ne doivent pas avoir cette directive
    expect(steps[1].defensiveDirectives?.some(
      (d) => d.sourceActionId === 'free-1',
    ) ?? false).toBe(false);
  });
});
