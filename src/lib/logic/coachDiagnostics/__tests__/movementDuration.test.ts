import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { metersToPx } from '@/lib/data/physics';
import type { AppState } from '@/lib/types';
import { computeCoachDiagnostics } from '..';

function scenario(meters = 5, seconds = 4): AppState {
  const state = makeInitialState();
  const a = structuredClone(state.steps[0]);
  a.duration = seconds;
  a.off.O1 = { x: 100, y: 430 };
  const b = structuredClone(a);
  b.off.O1.x += metersToPx(meters);
  state.steps = [a, b];
  return state;
}
function warnings(state: AppState, step = 0) {
  return computeCoachDiagnostics(state, step).filter(d => d.tag === 'movement-duration');
}
function offense(state: AppState, step = 0) {
  return warnings(state, step).filter(d => d.attackers.includes('O1'));
}

describe('diagnostic de durée du mouvement', () => {
  it('autorise une longue course si sa durée suffit, avertit dès la première étape sinon', () => {
    expect(offense(scenario(5, 4))).toEqual([]);
    const state = scenario(5, 0.25);
    expect(offense(state)).toHaveLength(1);
    expect(offense(state)[0].message).toContain('20.0 m/s');
    expect(offense(state)[0].message).toContain('Allonger la durée');
    expect(offense(state, 1)).toEqual(offense(state));
  });

  it('utilise la durée globale et le mode temps réel en absence de durée individuelle', () => {
    const state = scenario(5);
    delete state.steps[0].duration;
    state.secondsPerStep = 0.25;
    expect(offense(state)).toHaveLength(1);
    state.secondsPerStep = 4;
    expect(offense(state)).toEqual([]);
    delete state.secondsPerStep;
    state.realSpeedMode = true;
    expect(offense(state)).toHaveLength(1);
  });

  it('honore les fenêtres fractionnaires et la priorité des secondes absolues', () => {
    const state = scenario(5, 4);
    state.steps[0].annotations = [{ type: 'cut', fromId: 'O1', toId: null,
      from: state.steps[0].off.O1, to: state.steps[1].off.O1, tStart: 0.5, tEnd: 0.55 }];
    expect(offense(state)).toHaveLength(1);
    Object.assign(state.steps[0].annotations[0], { tStartAbs: 0, tEndAbs: 4 });
    expect(offense(state)).toEqual([]);
  });

  it('mesure un aller-retour avec points de passage malgré des extrémités proches', () => {
    const state = scenario(0, 0.5);
    state.steps[0].annotations = [{ type: 'dribble', fromId: 'O1', toId: null,
      from: state.steps[0].off.O1, to: state.steps[1].off.O1,
      waypoints: [{ x: 450, y: 430 }] }];
    expect(offense(state)).toHaveLength(1);
  });

  it('ne manque pas une fenêtre plus courte que le pas d’échantillonnage', () => {
    const state = scenario(1, 4);
    state.steps[0].annotations = [{ type: 'cut', fromId: 'O1', toId: null,
      from: state.steps[0].off.O1, to: state.steps[1].off.O1, tStart: 0.5, tEnd: 0.5001 }];
    expect(offense(state)).toHaveLength(1);
  });

  it('subdivise la durée des interpolations sans multiplier le temps disponible', () => {
    const state = scenario(5, 0.5);
    const middle = structuredClone(state.steps[0]);
    middle.isInterpolated = true;
    middle.off.O1.x = (state.steps[0].off.O1.x + state.steps[1].off.O1.x) / 2;
    state.steps.splice(1, 0, middle);
    expect(offense(state)[0].message).toContain('10.0 m/s');
    expect(offense(state, 1)[0].message).toContain('10.0 m/s');
    // Une portion lente suivie d'une portion impossible doit être signalée
    // depuis l'étape visible, même si la portion fautive est interpolée.
    middle.off.O1.x = state.steps[0].off.O1.x;
    const hidden = offense(state);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].message).toContain('20.0 m/s');
    expect(hidden[0].message).toContain('transition 1 → 2 (0.50 s)');
  });

  it('ignore les joueurs inactifs, reste déterministe et ne modifie pas le système', () => {
    const state = scenario(5, 0.25);
    state.playerCount = 3;
    state.steps[1].off.O5.x += 400;
    const before = structuredClone(state);
    const result = warnings(state);
    expect(result.some(d => d.attackers.includes('O5') || d.defenders.includes('D5'))).toBe(false);
    expect(state).toEqual(before);
    expect(warnings(state)).toEqual(result);
  });

  it('contrôle aussi les déplacements défensifs et respecte la durée individuelle', () => {
    const state = scenario(0, 0.01);
    state.steps[0].defenseOverrides = { D1: { x: 100, y: 150 } };
    state.steps[1].defenseOverrides = { D1: { x: 400, y: 150 } };
    expect(warnings(state).some(d => d.defenders.includes('D1'))).toBe(true);
    state.steps[0].duration = 10;
    expect(warnings(state).some(d => d.defenders.includes('D1'))).toBe(false);
  });

  it('reste utilisable avec le profil réaliste et sans transition', () => {
    const state = scenario(5, 0.1);
    state.realismProfile = 'realistic';
    expect(offense(state)).toHaveLength(1);
    state.steps.pop();
    expect(warnings(state)).toEqual([]);
  });
});
