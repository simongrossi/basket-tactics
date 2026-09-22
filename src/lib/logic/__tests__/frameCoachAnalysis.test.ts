import { expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { resolveTimelineFrame } from '../playback/frameResolver';
import { computeFrameCoachAnalysis } from '../frameCoachAnalysis';
import { computeMetrics } from '../metrics';
import { getDefenseHoop } from '../engine';
import { bestOffensiveAction, evaluateOffensiveOptions } from '../offense';

function scenario() {
  const template = TEMPLATES.find(t => t.id === 'screen-lab-pnr')!;
  return { ...makeInitialState(), steps: structuredClone(template.steps), defenseInitial: structuredClone(template.defenseInitial) };
}

it('analyse les positions affichées sans relire les positions de l’étape active', () => {
  const state = scenario();
  const frame = resolveTimelineFrame(state, 1.45)!;
  const before = structuredClone(state);
  const result = computeFrameCoachAnalysis(state, frame, true);
  const hoop = getDefenseHoop(state);
  expect(result.metrics).toEqual(computeMetrics(frame.off, frame.defPos, frame.carrier, hoop));
  expect(result.bestAction).toEqual(bestOffensiveAction(evaluateOffensiveOptions(frame.off, frame.defPos, frame.carrier, hoop, state.attackerProfiles)));
  expect(state).toEqual(before);
  const changed = { ...state, activeStep: 3 };
  expect(computeFrameCoachAnalysis(changed, frame, true)).toEqual(result);
});

it('utilise le panier de l’équipe attaquante et le porteur réellement affiché', () => {
  const state = scenario();
  const frame = structuredClone(resolveTimelineFrame(state, 1.45)!);
  frame.attackingTeam = 'away';
  frame.carrier = 'O2';
  const hoop = getDefenseHoop(state, 'away');
  frame.off.O2 = { x: hoop.x, y: hoop.y - 40 };
  Object.values(frame.defPos).forEach(d => { d.helpFactor = 0; });
  const result = computeFrameCoachAnalysis(state, frame, true);
  expect(result.metrics).toEqual(computeMetrics(frame.off, frame.defPos, 'O2', hoop));
  expect(result.diagnostics.some(d => d.tag === 'paint-no-help' && d.attackers.includes('O2'))).toBe(true);
  frame.attackingTeam = 'home';
  expect(computeFrameCoachAnalysis(state, frame, true).diagnostics.some(d => d.tag === 'paint-no-help')).toBe(false);
});

it('ne suggère pas une nouvelle passe ou un tir pendant que le ballon vole', () => {
  const state = scenario();
  const frame = { ...resolveTimelineFrame(state, 0.4)!, ballInFlight: true };
  const result = computeFrameCoachAnalysis(state, frame, true);
  expect(result.bestAction).toBeNull();
  expect(result.metrics.openPasses + result.metrics.contestedPasses + result.metrics.blockedPasses).toBe(0);
  expect(result.diagnostics.some(d => d.tag === 'pass-open' || d.tag.startsWith('read-'))).toBe(false);
});
