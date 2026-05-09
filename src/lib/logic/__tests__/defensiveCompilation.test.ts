import { describe, it, expect } from 'vitest';
import { resolveTargetSteps, expandToDirectives, applyDefensivePass } from '@/lib/logic/defensiveCompilation';
import type { DefensiveScriptedAction, Step } from '@/lib/types';

const stepWithGen = (idx: number, gen: string): Step => ({
  off: { O1: { x: 0, y: 0 }, O2: { x: 0, y: 0 }, O3: { x: 0, y: 0 }, O4: { x: 0, y: 0 }, O5: { x: 0, y: 0 } },
  ballCarrier: 'O1',
  annotations: [],
  generatedBy: gen,
  label: `step-${idx}`,
});

describe('resolveTargetSteps', () => {
  const steps: Step[] = [
    { ...stepWithGen(0, ''), label: 'Départ' },
    stepWithGen(1, 'A'),
    stepWithGen(2, 'A'),
    stepWithGen(3, 'A'),
    stepWithGen(4, 'B'),
  ];

  it("couplée sans affectedSteps → tous les steps du parent", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([1, 2, 3]);
  });

  it("couplée avec affectedSteps → filtre relatif au parent (indices 0-based dans le parent)", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      affectedSteps: [1, 2],
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([2, 3]);
  });

  it("libre → indices absolus", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      affectedSteps: [2, 4],
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([2, 4]);
  });

  it("parent inexistant → liste vide + warning console", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'INEXISTANT',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    expect(resolveTargetSteps(def, steps)).toEqual([]);
  });
});

describe('expandToDirectives', () => {
  it("trap : 1 directive engage par step ciblé", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    const result = expandToDirectives(def, [2, 3]);
    expect(result).toHaveLength(2);
    expect(result[0].directive).toMatchObject({ type: 'trap', phase: 'engage', sourceActionId: 'd1' });
    expect(result[0].stepIndex).toBe(2);
  });

  it("help-and-recover couplée : helpStep/recoverStep sont relatifs au parent", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'help-and-recover',
      parentActionId: 'A',
      params: { defenders: ['D2'], target: 'O1', helpStep: 0, recoverStep: 1 },
    };
    // targetStepIndices = [1, 2] (parent A occupe [1,2,3] mais on filtre via affectedSteps)
    // helpStep relatif 0 → targetStepIndices[0] = 1 (engage)
    // recoverStep relatif 1 → targetStepIndices[1] = 2 (release)
    const result = expandToDirectives(def, [1, 2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ stepIndex: 1, directive: { phase: 'engage' } });
    expect(result[1]).toMatchObject({ stepIndex: 2, directive: { phase: 'release' } });
  });

  it("help-and-recover libre : helpStep/recoverStep sont absolus", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'help-and-recover',
      affectedSteps: [3, 4],
      params: { defenders: ['D2'], target: 'O1', helpStep: 3, recoverStep: 4 },
    };
    const result = expandToDirectives(def, [3, 4]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ stepIndex: 3, directive: { phase: 'engage' } });
    expect(result[1]).toMatchObject({ stepIndex: 4, directive: { phase: 'release' } });
  });

  it("help-and-recover sans helpStep/recoverStep : utilise les 2 premiers targetStepIndices", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'help-and-recover',
      parentActionId: 'A',
      params: { defenders: ['D2'], target: 'O1' },
    };
    const result = expandToDirectives(def, [1, 2, 3]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ stepIndex: 1, directive: { phase: 'engage' } });
    expect(result[1]).toMatchObject({ stepIndex: 2, directive: { phase: 'release' } });
  });

  it("tag : 1 directive engage", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'tag',
      parentActionId: 'A',
      params: { defenders: ['D4'], target: 'O5' },
    };
    const result = expandToDirectives(def, [3]);
    expect(result).toHaveLength(1);
    expect(result[0].directive.phase).toBe('engage');
  });

  it("pre-switch : 1 engage uniquement (assignmentOverrides géré par applyDefensivePass)", () => {
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'pre-switch',
      parentActionId: 'A',
      params: { defenders: ['D1'], swapWith: 'D5' },
    };
    const result = expandToDirectives(def, [1]);
    expect(result).toHaveLength(1);
    expect(result[0].directive.phase).toBe('engage');
  });
});

describe('applyDefensivePass', () => {
  it("ajoute defensiveDirectives aux steps ciblés", () => {
    const steps: Step[] = [
      { ...stepWithGen(0, ''), label: 'Départ' },
      stepWithGen(1, 'A'),
      stepWithGen(2, 'A'),
    ];
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'trap',
      parentActionId: 'A',
      params: { defenders: ['D1', 'D5'], target: 'O1' },
    };
    applyDefensivePass(steps, [def], { 'A': { startIndex: 1, endIndex: 2 } });
    expect(steps[1].defensiveDirectives).toHaveLength(1);
    expect(steps[2].defensiveDirectives).toHaveLength(1);
    expect(steps[0].defensiveDirectives).toBeUndefined();
  });

  it("pre-switch : pose assignmentOverrides sur engage step + tous les suivants du parent", () => {
    const steps: Step[] = [
      { ...stepWithGen(0, ''), label: 'Départ' },
      stepWithGen(1, 'A'),
      stepWithGen(2, 'A'),
      stepWithGen(3, 'A'),
    ];
    const def: DefensiveScriptedAction = {
      kind: 'defensive', id: 'd1', type: 'pre-switch',
      parentActionId: 'A',
      affectedSteps: [0],
      params: { defenders: ['D1'], swapWith: 'D5' },
    };
    // assignations actuelles : D1→O1, D5→O5 (par convention numérique)
    applyDefensivePass(steps, [def], { 'A': { startIndex: 1, endIndex: 3 } });
    expect(steps[1].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
    expect(steps[2].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
    expect(steps[3].assignmentOverrides).toEqual({ D1: 'O5', D5: 'O1' });
  });
});
