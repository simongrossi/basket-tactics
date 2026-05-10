import { describe, it, expect } from 'vitest';
import { computePlayerTracks, countRealSteps } from '../playerTracks';
import { makeInitialState, makeStep } from '../../data/initial';
import type { AppState } from '../../types';

function cloneInit(): AppState {
  return structuredClone(makeInitialState());
}

describe('computePlayerTracks', () => {
  it('renvoie un tableau vide si moins de 2 étapes', () => {
    const state = cloneInit();
    expect(computePlayerTracks(state)).toEqual([]);
  });

  it('détecte un dribble du porteur', () => {
    const state = cloneInit();
    const initial = state.steps[0];
    const moved = makeStep({ ...initial.off, O1: { x: 300, y: 200 } }, 'O1', []);
    state.steps = [initial, moved];
    const tracks = computePlayerTracks(state);
    const o1 = tracks.find((t) => t.id === 'O1')!;
    expect(o1.kind).toBe('attacker');
    expect(o1.segments[0].activity).toBe('dribble');
    expect(o1.segments[0].isCarrier).toBe(true);
  });

  it('détecte un cut pour un non-porteur', () => {
    const state = cloneInit();
    const initial = state.steps[0];
    const moved = makeStep({ ...initial.off, O3: { x: 350, y: 130 } }, 'O1', []);
    state.steps = [initial, moved];
    const tracks = computePlayerTracks(state);
    const o3 = tracks.find((t) => t.id === 'O3')!;
    expect(o3.segments[0].activity).toBe('cut');
  });

  it('détecte une annotation screen', () => {
    const state = cloneInit();
    const initial = state.steps[0];
    initial.annotations = [
      { type: 'screen', fromId: 'O5', toId: null, from: { x: 380, y: 230 }, to: { x: 320, y: 200 } },
    ];
    state.steps = [initial, makeStep({ ...initial.off, O5: { x: 320, y: 200 } }, 'O1', [])];
    const tracks = computePlayerTracks(state);
    const o5 = tracks.find((t) => t.id === 'O5')!;
    expect(o5.segments[0].activity).toBe('screen');
  });

  it('détecte une annotation pass et change le porteur', () => {
    const state = cloneInit();
    const initial = state.steps[0];
    initial.annotations = [
      { type: 'pass', fromId: 'O1', toId: 'O3', from: { x: 300, y: 470 }, to: { x: 470, y: 380 } },
    ];
    state.steps = [initial, makeStep(initial.off, 'O3', [])];
    const tracks = computePlayerTracks(state);
    const o1 = tracks.find((t) => t.id === 'O1')!;
    expect(o1.segments[0].activity).toBe('pass');
    expect(o1.segments[0].isCarrier).toBe(true); // porteur AU MOMENT de la passe
    expect(o1.segments[0].detail).toBe('→ O3');
  });

  it('produit une piste par défenseur actif', () => {
    const state = cloneInit();
    const moved = makeStep({ ...state.steps[0].off, O1: { x: 300, y: 300 } }, 'O1', []);
    state.steps = [state.steps[0], moved];
    const tracks = computePlayerTracks(state);
    const defs = tracks.filter((t) => t.kind === 'defender');
    expect(defs.length).toBe(5);
  });

  it('fusionne les steps interpolés (ne crée pas une piste segment pour eux)', () => {
    const state = cloneInit();
    const initial = state.steps[0];
    const interp = makeStep({ ...initial.off, O1: { x: 300, y: 350 } }, 'O1', []);
    interp.isInterpolated = true;
    const final = makeStep({ ...initial.off, O1: { x: 300, y: 200 } }, 'O1', []);
    state.steps = [initial, interp, final];
    const tracks = computePlayerTracks(state);
    const o1 = tracks.find((t) => t.id === 'O1')!;
    // Une seule transition "réelle" : initial → final (interp est fusionné)
    expect(o1.segments).toHaveLength(1);
  });
});

describe('countRealSteps', () => {
  it('exclut les steps interpolés', () => {
    const state = cloneInit();
    const a = state.steps[0];
    const b = makeStep(a.off, 'O1', []);
    b.isInterpolated = true;
    const c = makeStep(a.off, 'O1', []);
    state.steps = [a, b, c];
    expect(countRealSteps(state)).toBe(2);
  });
});
