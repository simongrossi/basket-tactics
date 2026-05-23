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

  it('avec annotation dribble : le porteur dans la direction du dribble', () => {
    const { state, carrier, endPos } = buildTwoStepWithCarrierMove(true);
    const visuals = computeAttackerVisuals(state, 1);
    // delta = endPos - startPos = (+200, -100). Extrapolation = endPos + delta = (700, 300).
    const expectedTowardDribble = angleFromNorth(endPos.x, endPos.y, 700, 300);
    expect(visuals[carrier].orientation).toBeCloseTo(expectedTowardDribble, 1);
  });
});
