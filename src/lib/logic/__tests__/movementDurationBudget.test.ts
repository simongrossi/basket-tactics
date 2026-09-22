import { expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '../engine';
import { distance } from '../geometry';

function scenario(seconds: number) {
  const state = makeInitialState();
  const first = structuredClone(state.steps[0]);
  first.off.O1 = { x: 300, y: 500 };
  first.duration = seconds;
  const second = structuredClone(first);
  second.duration = 20; // Must not control the incoming transition.
  second.off.O1 = { x: 300, y: 200 };
  state.steps = [first, second];
  return state;
}
function travel(state: ReturnType<typeof scenario>) {
  return distance(effectiveDefensePositions(state, 0).D1, effectiveDefensePositions(state, 1).D1);
}

it('une transition courte réduit le déplacement disponible, la durée source fait foi', () => {
  expect(travel(scenario(0.5))).toBeLessThan(travel(scenario(4)) * 0.5);
  const state = scenario(0.5);
  const before = travel(state);
  state.steps[1].duration = 0.01;
  expect(travel(state)).toBeCloseTo(before);
});

it('invalide le cache lors d’un changement de durée globale sur le même état', () => {
  const state = scenario(4);
  delete state.steps[0].duration;
  state.secondsPerStep = 4;
  const before = travel(state);
  state.secondsPerStep = 0.5;
  expect(travel(state)).toBeLessThan(before * 0.5);
});

it('une interpolation ne crée pas un budget supplémentaire de vitesse ou d’accélération', () => {
  const state = scenario(4);
  state.accelerationModelEnabled = true;
  state.defenderAcceleration = 40;
  const split = structuredClone(state);
  const middle = structuredClone(split.steps[1]);
  middle.isInterpolated = true;
  split.steps.splice(1, 0, middle);
  const d0 = effectiveDefensePositions(split, 0).D1;
  const d1 = effectiveDefensePositions(split, 1).D1;
  const d2 = effectiveDefensePositions(split, 2).D1;
  // A split must not accelerate twice as much simply because there are
  // more saved positions. Collisions can still add a small correction.
  expect(distance(d0, d1) + distance(d1, d2)).toBeLessThanOrEqual(travel(state) + 1);
});
