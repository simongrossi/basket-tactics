// Bug fix — orientation du porteur après déplacement manuel.
//
// Avant la fix : `attackerVisuals.ts` passait `prevPos` inconditionnellement
// au calcul d'orientation. Le delta `prevStep → curStep` > 30 px déclenchait
// la détection "dribble" et orientait le porteur dans la direction du
// déplacement. Conséquence : un déplacement manuel par drag faisait
// pivoter le porteur dans une direction non-narrative.
//
// Après la fix : la détection delta n'est activée pour le porteur que s'il
// existe une annotation `dribble` réelle (sur le step courant OU le step
// précédent). Sans annotation = déplacement manuel = porteur face au panier.

import { describe, expect, it } from 'vitest';
import type { AnnotationType, Step } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { computeAttackerVisuals } from '@/lib/logic/attackerVisuals';
import { getDefenseHoop } from '@/lib/logic/engine';
import { resolveTimelineFrame } from '@/lib/logic/playback/frameResolver';

function angleFromNorth(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  while (a < 0) a += 360;
  while (a >= 360) a -= 360;
  return a;
}

function buildTwoStepWithCarrierMove(withDribble: boolean) {
  const s = makeInitialState();
  const carrier = s.steps[0].ballCarrier; // typiquement 'O1'
  const startPos = { x: 300, y: 500 };
  // Déplacement asymétrique : delta = (+200, -100) → magnitude ~224 px (> 30).
  // Direction vers (700, 300) = sud-est-ish, distincte de la direction panier.
  const endPos = { x: 500, y: 400 };
  const step0: Step = {
    ...s.steps[0],
    off: { ...s.steps[0].off, [carrier]: startPos },
    annotations: withDribble
      ? [
          {
            type: 'dribble' as AnnotationType,
            fromId: carrier,
            from: startPos,
            to: endPos,
          },
        ]
      : [],
  };
  const step1: Step = {
    ...s.steps[0],
    off: { ...s.steps[0].off, [carrier]: endPos },
    annotations: [],
  };
  return { state: { ...s, steps: [step0, step1] }, carrier, startPos, endPos };
}

describe('attackerVisuals — orientation porteur après déplacement', () => {
  it('sans annotation dribble : le porteur face au panier, pas au delta du déplacement', () => {
    const { state, carrier, endPos } = buildTwoStepWithCarrierMove(false);
    const visuals = computeAttackerVisuals(state, 1);
    const hoop = getDefenseHoop(state);
    const expectedTowardHoop = angleFromNorth(endPos.x, endPos.y, hoop.x, hoop.y);
    expect(visuals[carrier].orientation).toBeCloseTo(expectedTowardHoop, 1);
  });

  it('avec annotation dribble : le porteur oriente son buste dans la direction du dribble et lève le regard vers le panier (clampé à ±75°)', () => {
    const { state, carrier, endPos } = buildTwoStepWithCarrierMove(true);
    const visuals = computeAttackerVisuals(state, 1);
    const hoop = getDefenseHoop(state);
    // delta = endPos - startPos = (+200, -100). Extrapolation = endPos + delta = (700, 300).
    const expectedTowardDribble = angleFromNorth(endPos.x, endPos.y, 700, 300);
    expect(visuals[carrier].orientation).toBeCloseTo(expectedTowardDribble, 1);
    // Le regard tourne vers le panier dans la limite anatomique ±75° du buste
    const expectedTowardHoop = angleFromNorth(endPos.x, endPos.y, hoop.x, hoop.y);
    const gazeToHoopDiff = Math.abs(((visuals[carrier].gazeOrientation - expectedTowardHoop + 540) % 360) - 180);
    expect(gazeToHoopDiff).toBeLessThan(25);
  });

  it('pendant la lecture (resolveTimelineFrame à mi-étape), un joueur déplacé manuellement s’oriente dans le sens de sa course', () => {
    const { state, carrier, startPos, endPos } = buildTwoStepWithCarrierMove(false);
    // Déplaçons aussi un non-porteur (O2) manuellement sans flèche
    const o2Start = { x: 120, y: 420 };
    const o2End = { x: 120, y: 180 }; // course franche vers la ligne de fond (0°)
    state.steps[0].off.O2 = o2Start;
    state.steps[1].off.O2 = o2End;

    const midFrame = resolveTimelineFrame(state, 0.5)!;
    expect(midFrame).not.toBeNull();

    // O2 (coupeur manuel sans flèche) court vers (120, 180) -> buste orienté dans le sens de course (~0°)
    const o2ExpectedCourse = angleFromNorth(o2Start.x, o2Start.y, o2End.x, o2End.y);
    const o2Diff = Math.abs(((midFrame.attVisuals.O2.orientation - o2ExpectedCourse + 540) % 360) - 180);
    expect(o2Diff).toBeLessThan(20);

    // Le porteur déplacé manuellement entre l'étape 0 et l'étape 1 s'oriente aussi vers son déplacement pendant la course
    const carrierExpectedCourse = angleFromNorth(startPos.x, startPos.y, endPos.x, endPos.y);
    const carrierDiff = Math.abs(((midFrame.attVisuals[carrier].orientation - carrierExpectedCourse + 540) % 360) - 180);
    expect(carrierDiff).toBeLessThan(25);
  });

  it('sur la dernière étape créée (+ Étape puis déplacement manuel d’un non-porteur), le joueur garde le buste dans le sens de sa course et regarde vers le porteur ou devant lui', () => {
    const s = makeInitialState();
    const step0: Step = {
      ...s.steps[0],
      off: { ...s.steps[0].off, O1: { x: 300, y: 420 }, O2: { x: 120, y: 420 } },
    };
    const step1: Step = {
      ...step0,
      off: { ...step0.off, O2: { x: 120, y: 200 } }, // O2 déplacé vers le panier (0°)
    };
    const state = { ...s, steps: [step0, step1], activeStep: 1 };
    const visuals = computeAttackerVisuals(state, 1);
    // Buste de O2 orienté dans le sens de sa course (0°)
    expect(visuals.O2.orientation).toBeCloseTo(0, 1);
    // Regard dans la limite anatomique ±75° du buste
    const gazeDiff = Math.abs(((visuals.O2.gazeOrientation - visuals.O2.orientation + 540) % 360) - 180);
    expect(gazeDiff).toBeLessThanOrEqual(75.01);
  });
});
