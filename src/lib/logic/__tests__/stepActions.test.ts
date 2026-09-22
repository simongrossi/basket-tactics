import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { loadTemplate } from '@/lib/state/transforms/coreTransforms';
import type { Step } from '@/lib/types';
import { actionsOfStep, actionStepOf } from '../stepActions';

const describeActions = (steps: Step[], k: number) =>
  actionsOfStep(steps, k).map(({ annotation: a }) => `${a.type}:${a.fromId}${a.toId ? '>' + a.toId : ''}`);

describe('stepActions', () => {
  it('course sur son étape de départ, passe sur son étape d’arrivée → même étape k', () => {
    const s = makeInitialState();
    const o = s.steps[0].off;
    const steps: Step[] = [
      { off: { ...o }, ballCarrier: 'O1', annotations: [
        { type: 'cut', fromId: 'O2', toId: null, from: o.O2, to: { x: 60, y: 520 } },
      ] },
      { off: { ...o, O2: { x: 60, y: 520 } }, ballCarrier: 'O2', annotations: [
        { type: 'pass', fromId: 'O1', toId: 'O2', from: o.O1, to: o.O2 },
      ] },
    ];
    expect(describeActions(steps, 0)).toEqual(['cut:O2', 'pass:O1>O2']);
    expect(describeActions(steps, 1)).toEqual([]);
    expect(actionStepOf(steps, 1, steps[1].annotations[0])).toBe(0);
  });

  it('déplacement décrit sur l’arrivée (modèles) → affiché sur l’étape précédente', () => {
    const s = makeInitialState();
    const o = s.steps[0].off;
    const dest = { x: 200, y: 200 };
    const steps: Step[] = [
      { off: { ...o }, ballCarrier: 'O1', annotations: [] },
      { off: { ...o, O3: dest }, ballCarrier: 'O1', annotations: [
        { type: 'cut', fromId: 'O3', toId: null, from: o.O3, to: dest },
      ] },
    ];
    expect(describeActions(steps, 0)).toEqual(['cut:O3']);
    expect(describeActions(steps, 1)).toEqual([]);
  });

  it('Horns flare : la passe O1→O2 se lit sur l’étape où elle part', () => {
    const t = TEMPLATES.find((x) => x.id === 'horns-flare')!;
    const { steps } = loadTemplate(makeInitialState(), t);
    expect(describeActions(steps, 0)).toContain('pass:O1>O2');
    expect(describeActions(steps, 1)).not.toContain('pass:O1>O2');
    const last = steps.length - 1;
    expect(describeActions(steps, last - 1)).toContain('pass:O2>O1');
    expect(describeActions(steps, last)).toEqual([]);
  });

  it('pas de doublon quand le déplacement existe aussi au départ', () => {
    const t = TEMPLATES.find((x) => x.id === 'horns-flare')!;
    const { steps } = loadTemplate(makeInitialState(), t);
    // Le chargement régénère « dribble O1 » au départ ; la « coupe O1 »
    // décrite sur l'arrivée par le modèle n'est plus listée.
    expect(describeActions(steps, 0).filter((a) => a.endsWith(':O1'))).toEqual(['dribble:O1']);
  });
});
