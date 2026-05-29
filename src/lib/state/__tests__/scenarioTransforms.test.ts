// Tests des transformations scénario scripté (actions + branches).

import { describe, expect, it } from 'vitest';
import type { ScriptedAction, ScenarioBranch } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import * as scTx from '../transforms/scenarioTransforms';

function makeAction(id: string): ScriptedAction {
  return {
    kind: 'offensive',
    id,
    type: 'pass',
    params: { actor: 'O1', target: 'O2' },
  } as unknown as ScriptedAction;
}

function makeBranch(id: string, actions: ScriptedAction[] = []): ScenarioBranch {
  return { id, label: id, divergeAfterActionId: 'root', actions };
}

describe('scenarioTransforms — actions main', () => {
  it('addScriptedAction sans branche active → mainActions', () => {
    const s0 = makeInitialState();
    const s1 = scTx.addScriptedAction(s0, makeAction('a1'));
    expect(s1.scriptedActions?.length).toBe(1);
    expect(s1.scriptedActions?.[0].id).toBe('a1');
  });

  it("updateScriptedAction remplace par id", () => {
    const s0 = scTx.addScriptedAction(makeInitialState(), makeAction('a1'));
    const s1 = scTx.updateScriptedAction(s0, 'a1', {
      ...makeAction('a1'),
      params: { actor: 'O3', target: 'O5' } as never,
    } as unknown as ScriptedAction);
    expect((s1.scriptedActions?.[0] as unknown as { params: { actor: string } }).params.actor).toBe('O3');
  });

  it("deleteScriptedAction supprime + libère les steps generatedBy", () => {
    const s0 = makeInitialState();
    const withStep = {
      ...s0,
      scriptedActions: [makeAction('a1')],
      steps: [
        s0.steps[0],
        { ...s0.steps[0], generatedBy: 'a1', manualOverride: true },
      ],
    };
    const s1 = scTx.deleteScriptedAction(withStep, 'a1');
    expect(s1.scriptedActions?.length).toBe(0);
    expect(s1.steps[1].manualOverride).toBe(false);
  });

  it("moveScriptedAction up/down dans la liste", () => {
    const s0 = makeInitialState();
    const filled = { ...s0, scriptedActions: [makeAction('a'), makeAction('b'), makeAction('c')] };
    const moved = scTx.moveScriptedAction(filled, 'b', 'up');
    expect(moved.scriptedActions?.map((a) => a.id)).toEqual(['b', 'a', 'c']);
    const movedDown = scTx.moveScriptedAction(filled, 'b', 'down');
    expect(movedDown.scriptedActions?.map((a) => a.id)).toEqual(['a', 'c', 'b']);
  });

  it("moveScriptedAction respecte les bornes (no-op aux extrémités)", () => {
    const s0 = makeInitialState();
    const filled = { ...s0, scriptedActions: [makeAction('a'), makeAction('b')] };
    const movedUpFirst = scTx.moveScriptedAction(filled, 'a', 'up');
    expect(movedUpFirst.scriptedActions?.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it("clearScriptedActions vide la liste sans toucher aux steps", () => {
    const s0 = scTx.addScriptedAction(makeInitialState(), makeAction('a1'));
    const stepCount = s0.steps.length;
    const cleared = scTx.clearScriptedActions(s0);
    expect(cleared.scriptedActions).toEqual([]);
    expect(cleared.steps.length).toBe(stepCount);
  });
});

describe('scenarioTransforms — branches', () => {
  it("addScenarioBranch ajoute à la liste", () => {
    const s0 = makeInitialState();
    const s1 = scTx.addScenarioBranch(s0, makeBranch('b1'));
    expect(s1.scenarioBranches?.length).toBe(1);
    expect(s1.scenarioBranches?.[0].id).toBe('b1');
  });

  it("deleteScenarioBranch nettoie activeBranchId si la branche supprimée était active", () => {
    const s0 = makeInitialState();
    const s1 = scTx.addScenarioBranch(s0, makeBranch('b1'));
    const s2 = { ...s1, activeBranchId: 'b1' };
    const s3 = scTx.deleteScenarioBranch(s2, 'b1');
    expect(s3.scenarioBranches?.length).toBe(0);
    expect(s3.activeBranchId).toBeNull();
  });

  it("addScriptedAction avec branche active → branch.actions", () => {
    const s0 = makeInitialState();
    const s1 = scTx.addScenarioBranch(s0, makeBranch('b1'));
    const s2 = { ...s1, activeBranchId: 'b1' };
    const s3 = scTx.addScriptedAction(s2, makeAction('aBranch'));
    expect(s3.scenarioBranches?.[0].actions.length).toBe(1);
    expect(s3.scenarioBranches?.[0].actions[0].id).toBe('aBranch');
    // mainActions reste vide.
    expect(s3.scriptedActions?.length ?? 0).toBe(0);
  });

  it("addScenarioBranches ajoute en lot", () => {
    const s0 = makeInitialState();
    const s1 = scTx.addScenarioBranches(s0, [makeBranch('b1'), makeBranch('b2')]);
    expect(s1.scenarioBranches?.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it("addScenarioBranches([]) est un no-op", () => {
    const s0 = makeInitialState();
    const s1 = scTx.addScenarioBranches(s0, []);
    expect(s1).toBe(s0);
  });

  it("une branche réactive (trigger) déclenche une recompile à l'ajout", () => {
    // Sans scriptedActions, recompile est un no-op fonctionnel mais ne doit pas
    // throw ; on vérifie surtout que la branche réactive est bien stockée.
    const s0 = makeInitialState();
    const reactive: ScenarioBranch = {
      ...makeBranch('b-drop'),
      trigger: { kind: 'screen-coverage', actionId: 'root', coverage: ['drop'] },
    };
    const s1 = scTx.addScenarioBranch(s0, reactive);
    const t = s1.scenarioBranches?.[0].trigger;
    expect(t?.kind === 'screen-coverage' && t.coverage).toEqual(['drop']);
  });
});
