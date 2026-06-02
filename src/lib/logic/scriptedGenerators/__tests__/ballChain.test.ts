import { describe, it, expect } from 'vitest';
import { expandBallChain, genBallReversal, genDhoChain } from '@/lib/logic/scriptedGenerators/ballChain';
import type { AttackerPositions, OffensiveScriptedAction, Step } from '@/lib/types';

function prevStep(): Step {
  const off: AttackerPositions = {
    O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 120, y: 200 },
    O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
  };
  return { off, ballCarrier: 'O1', annotations: [] };
}
function chainAction(id: string, chain: string[], modes?: ('pass' | 'dho')[]): OffensiveScriptedAction {
  return { kind: 'offensive', id, type: 'ball-reversal', params: { chain: chain as never, chainLinkModes: modes } };
}

describe('expandBallChain', () => {
  it('reversal tout-passe : N−1 steps, ballon finit sur le dernier joueur', () => {
    const steps = genBallReversal(prevStep(), chainAction('r', ['O1', 'O2', 'O3']));
    expect(steps).toHaveLength(2);
    expect(steps[steps.length - 1].ballCarrier).toBe('O3');
  });

  it('dho-chain : 2 steps par lien', () => {
    const steps = genDhoChain(prevStep(), chainAction('d', ['O1', 'O2']));
    expect(steps).toHaveLength(2);
    expect(steps[steps.length - 1].ballCarrier).toBe('O2');
  });

  it('modes mixtes : pass puis dho', () => {
    const steps = expandBallChain(prevStep(), chainAction('m', ['O1', 'O2', 'O3'], ['pass', 'dho']), 'pass');
    expect(steps).toHaveLength(1 + 2);
  });

  it('chainLinkModes plus court → liens restants au defaultMode', () => {
    const steps = expandBallChain(prevStep(), chainAction('s', ['O1', 'O2', 'O3'], ['dho']), 'pass');
    expect(steps).toHaveLength(2 + 1);
  });

  it('generatedBy namespacé #lI', () => {
    const steps = genBallReversal(prevStep(), chainAction('r', ['O1', 'O2', 'O3']));
    expect(steps[0].generatedBy).toBe('r#l0');
    expect(steps[1].generatedBy).toBe('r#l1');
  });

  it('chain absent ou < 2 → []', () => {
    expect(genBallReversal(prevStep(), chainAction('x', []))).toEqual([]);
    expect(genBallReversal(prevStep(), chainAction('x', ['O1']))).toEqual([]);
    expect(genBallReversal(prevStep(), { kind: 'offensive', id: 'x', type: 'ball-reversal', params: {} })).toEqual([]);
  });
});
