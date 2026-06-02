import { describe, it, expect } from 'vitest';
import { rotateActionParams, expandContinuityLoop } from '@/lib/logic/reads/continuityLoop';
import type {
  AttackerId, ContinuityLoop, OffensiveScriptedAction, ScriptedAction, ScriptedActionParams,
} from '@/lib/types';

const wheel: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

describe('rotateActionParams', () => {
  it('k=0 → identité', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1', screener: 'O5' };
    expect(rotateActionParams(p, wheel, 0)).toEqual(p);
  });

  it('k=1 → chaque joueur avance d’un cran sur la roue', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1', screener: 'O5', cutter: 'O3' };
    expect(rotateActionParams(p, wheel, 1)).toEqual({
      ballHandler: 'O2', screener: 'O1', cutter: 'O4',
    });
  });

  it('k=2 cumulatif (σ²)', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1' };
    expect(rotateActionParams(p, wheel, 2).ballHandler).toBe('O3');
  });

  it('wrap autour de la roue', () => {
    const p: ScriptedActionParams = { ballHandler: 'O5' };
    expect(rotateActionParams(p, wheel, 1).ballHandler).toBe('O1');
  });

  it('ne touche PAS les champs non-joueur', () => {
    const p: ScriptedActionParams = { ballHandler: 'O1', side: 'fort', direction: 'panier' };
    const out = rotateActionParams(p, wheel, 1);
    expect(out.side).toBe('fort');
    expect(out.direction).toBe('panier');
  });

  it('joueur absent de la roue → inchangé', () => {
    const partial: AttackerId[] = ['O1', 'O2'];
    expect(rotateActionParams({ screener: 'O5' }, partial, 1).screener).toBe('O5');
  });
});

function offAction(id: string, ballHandler: AttackerId): OffensiveScriptedAction {
  return { kind: 'offensive', id, type: 'pass', params: { passer: ballHandler, receiver: 'O2' } };
}

const loop3: ContinuityLoop = {
  startActionId: 'b1', endActionId: 'b2', rotation: ['O1', 'O2', 'O3', 'O4', 'O5'], maxCycles: 3,
};

describe('expandContinuityLoop', () => {
  const body = [offAction('b1', 'O1'), offAction('b2', 'O3')];
  const actions = [offAction('a0', 'O1'), ...body, offAction('a9', 'O4')];

  it('déroule maxCycles fois (avant + K×corps + après)', () => {
    const out = expandContinuityLoop(actions, loop3, wheel);
    // 1 (avant) + 3 cycles × 2 (corps) + 1 (après) = 8
    expect(out).toHaveLength(8);
  });

  it('cycle 0 = identité (id + params conservés)', () => {
    const out = expandContinuityLoop(actions, loop3, wheel);
    expect(out[1].id).toBe('b1');
    expect((out[1] as OffensiveScriptedAction).params.passer).toBe('O1');
  });

  it('cycle 1 = id namespacé + params σ¹', () => {
    const out = expandContinuityLoop(actions, loop3, wheel);
    const c1 = out[3]; // avant(1) + corps c0(2) → index 3 = b1#c1
    expect(c1.id).toBe('b1#c1');
    expect((c1 as OffensiveScriptedAction).params.passer).toBe('O2');
  });

  it('maxCycles clampé à 6', () => {
    const out = expandContinuityLoop(actions, { ...loop3, maxCycles: 99 }, wheel);
    expect(out).toHaveLength(1 + 6 * 2 + 1);
  });

  it('rotation invalide (pas une permutation) → fallback liste inchangée', () => {
    const out = expandContinuityLoop(actions, { ...loop3, rotation: ['O1', 'O2'] }, wheel);
    expect(out).toBe(actions);
  });

  it('plage invalide (id absent) → fallback', () => {
    const out = expandContinuityLoop(actions, { ...loop3, endActionId: 'nope' }, wheel);
    expect(out).toBe(actions);
  });

  it('corps contenant une action non-offensive → fallback', () => {
    const def: ScriptedAction = { kind: 'defensive', id: 'b2', type: 'switch', params: {} } as unknown as ScriptedAction;
    const mixed = [offAction('a0', 'O1'), offAction('b1', 'O1'), def, offAction('a9', 'O4')];
    const out = expandContinuityLoop(mixed, { ...loop3, endActionId: 'b2' }, wheel);
    expect(out).toBe(mixed);
  });

  it('sortie anticipée : exitAtCycle(k)=true stoppe + joue exitActions remappées, puis après', () => {
    const exit = [offAction('x', 'O1')];
    const out = expandContinuityLoop(actions, loop3, wheel, {
      exitAtCycle: (k) => k === 2,
      exitActions: exit,
    });
    // avant(1) + 2 cycles × 2 (c0,c1) + exit(1) + après(1) = 7
    expect(out).toHaveLength(7);
    const exitAction = out[5];
    expect(exitAction.id).toBe('x#c2');
    expect((exitAction as OffensiveScriptedAction).params.passer).toBe('O3'); // σ²
  });
});
