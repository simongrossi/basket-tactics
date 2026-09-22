import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { resolveFrameAt, resolveTimelineFrame } from '../playback/frameResolver';

function scenario() {
  const template = TEMPLATES.find((t) => t.id === 'screen-lab-pnr')!;
  return { ...makeInitialState(), steps: structuredClone(template.steps),
    defenseInitial: structuredClone(template.defenseInitial) };
}

describe('timeline indépendante de la fréquence affichée', () => {
  it('rejoint la même frame à 24, 30, 60 et 144 Hz, après un retour arrière ou une image sautée', () => {
    const target = 1.437;
    const expected = resolveTimelineFrame(scenario(), target)!;
    for (const hz of [24, 30, 60, 144]) {
      const state = scenario();
      for (let i = 0; i / hz < target; i++) resolveTimelineFrame(state, i / hz);
      expect(resolveTimelineFrame(state, target)).toEqual(expected);
      resolveTimelineFrame(state, 2.18);
      resolveTimelineFrame(state, 0.21);
      expect(resolveTimelineFrame(state, target)).toEqual(expected);
    }
  });

  it('applique l’easing une seule fois et respecte les frontières d’étapes', () => {
    for (const easing of ['ease-in-out', 'ease-out'] as const) {
      const state = { ...scenario(), movementEasing: easing };
      for (const target of [0.35, 1, 1.23]) {
        const oracleState = structuredClone(state);
        let expected = resolveFrameAt(oracleState, 0)!;
        const count = Math.floor(target * 60);
        for (let i = 1; i <= count; i++) expected = resolveFrameAt(oracleState, i / 60, { prevFrame: expected })!;
        if (count / 60 < target) expected = resolveFrameAt(oracleState, target, { prevFrame: expected })!;
        expect(resolveTimelineFrame(state, target), `${easing} ${target}`).toEqual(expected);
      }
    }
  });

  it('invalide les frames après édition, même si un appelant réutilise son objet état', () => {
    const state = scenario();
    const before = resolveTimelineFrame(state, 0.4)!;
    state.steps[0].off.O2 = { x: 90, y: 420 };
    const after = resolveTimelineFrame(state, 0.4)!;
    expect(after).toEqual(resolveTimelineFrame(structuredClone(state), 0.4));
    expect(after.off.O2).not.toEqual(before.off.O2);
  });

  it('isole les options de diagnostic et le numéro affiché de la mémoire physique', () => {
    const state = scenario();
    const first = resolveTimelineFrame(state, 1.45)!;
    const debug = resolveTimelineFrame(state, 1.45, { collectDecisions: true, stepIdx: 99, prevFrame: first })!;
    expect(debug.debug).toBeDefined();
    expect(debug.stepIdx).toBe(99);
    expect(debug.off).toEqual(first.off);
    expect(debug.defPos).toEqual(first.defPos);
    expect(resolveTimelineFrame(state, 1.45)).toEqual(first);
  });

  it('réutilise la reconstruction pour les lectures répétées et le scrub', () => {
    const state = scenario();
    resolveTimelineFrame(state, 2);
    const start = performance.now();
    for (let i = 0; i < 100; i++) resolveTimelineFrame(state, 1 + i / 100);
    expect((performance.now() - start) / 100).toBeLessThan(8);
  });
});
