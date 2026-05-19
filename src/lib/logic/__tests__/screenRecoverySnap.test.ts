// Tests de non-régression — snap de recovery post-écran.
//
// Bug diagnostiqué (PNR central) : entre step 1 (D1 stuck sur O5) et step 2
// (O1 a utilisé l'écran et drive à droite), D1 reste plaqué sur O5 jusque
// ~85% du segment, puis fait un sprint brutal de ~70 px en 15% du temps
// pour rattraper O1.
//
// Symptôme visuel : sensation de "rubber-band" / téléportation à la fin
// du drive. Cause : `screenContactAdhesion` en mode 'leaving' libère D1
// trop tardivement (`holdEnd = 0.88` à quality 1.0, smoothstep `0.88 →
// 0.98` = 10% du segment).
//
// Garde-fou : le déplacement de D1 entre 2 frames consécutives ne doit
// jamais dépasser `MAX_FRAME_DELTA_PX = 18 px` (≈ vitesse perçue acceptable
// à 60 fps sur le terrain virtuel).

import { describe, expect, it } from 'vitest';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, Annotation, AttackerPositions, DefenderPositions } from '@/lib/types';

const MAX_FRAME_DELTA_PX = 18;
const FRAMES_PER_SEGMENT = 20;

// PNR central — positions du template `pnr-central` dans templates.ts.
const pnrSetup: AttackerPositions = {
  O1: { x: 300, y: 380 }, O2: { x: 130, y: 320 }, O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 }, O5: { x: 310, y: 230 },
};
const pnrScreen: AttackerPositions = { ...pnrSetup, O5: { x: 290, y: 340 } };
const pnrUse: AttackerPositions = { ...pnrScreen, O1: { x: 380, y: 310 } };
const pnrRoll: AttackerPositions = { ...pnrUse, O5: { x: 300, y: 180 } };

function buildPnrCentral(): AppState {
  const defenseInitial: DefenderPositions = {
    D1: { x: pnrSetup.O1.x, y: pnrSetup.O1.y - 40 },
    D2: { x: pnrSetup.O2.x, y: pnrSetup.O2.y - 40 },
    D3: { x: pnrSetup.O3.x, y: pnrSetup.O3.y - 40 },
    D4: { x: pnrSetup.O4.x, y: pnrSetup.O4.y + 40 },
    D5: { x: pnrSetup.O5.x, y: pnrSetup.O5.y + 40 },
  };
  return {
    ...makeInitialState(),
    defenseInitial,
    steps: [
      { off: pnrSetup, ballCarrier: 'O1', annotations: [] },
      {
        off: pnrScreen, ballCarrier: 'O1',
        annotations: [
          { type: 'cut', fromId: 'O5', toId: null, from: pnrSetup.O5, to: pnrScreen.O5 } as Annotation,
          { type: 'screen', fromId: 'O5', toId: null, from: pnrScreen.O5, to: { x: pnrScreen.O5.x, y: pnrScreen.O5.y + 18 } } as Annotation,
        ],
      },
      {
        off: pnrUse, ballCarrier: 'O1',
        annotations: [{ type: 'dribble', fromId: 'O1', toId: null, from: pnrSetup.O1, to: pnrUse.O1 } as Annotation],
      },
      {
        off: pnrRoll, ballCarrier: 'O1',
        annotations: [{ type: 'cut', fromId: 'O5', toId: null, from: pnrScreen.O5, to: pnrRoll.O5 } as Annotation],
      },
    ],
    activeStep: 0,
  };
}

function maxFrameDelta(state: AppState, defenderId: 'D1' | 'D2' | 'D3' | 'D4' | 'D5', tStart: number, tEnd: number): { max: number; atT: number } {
  let max = 0;
  let atT = tStart;
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= FRAMES_PER_SEGMENT; i++) {
    const t = tStart + (i / FRAMES_PER_SEGMENT) * (tEnd - tStart);
    const frame = resolveFrameAt(state, t);
    if (!frame) continue;
    const p = frame.defPos[defenderId];
    if (!p) continue;
    if (prev) {
      const delta = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (delta > max) { max = delta; atT = t; }
    }
    prev = p;
  }
  return { max, atT };
}

describe('PnR central — recovery post-écran sans snap', () => {
  it("transition step 1 → step 2 : D1 ne fait pas de saut > MAX_FRAME_DELTA_PX", () => {
    const state = buildPnrCentral();
    const { max, atT } = maxFrameDelta(state, 'D1', 1, 2);
    // Si ce test FAIL : screenContactAdhesion en mode 'leaving' libère
    // D1 trop tardivement → sprint compressé en fin de segment.
    expect(max, `Max Δ frame D1 = ${max.toFixed(1)} px à t=${atT.toFixed(2)}`).toBeLessThanOrEqual(MAX_FRAME_DELTA_PX);
  });

  it("transition step 0 → step 1 : D1 entre en contact progressivement (pas de jump)", () => {
    const state = buildPnrCentral();
    const { max } = maxFrameDelta(state, 'D1', 0, 1);
    expect(max).toBeLessThanOrEqual(MAX_FRAME_DELTA_PX);
  });

  it("transition step 2 → step 3 (roll) : D1 suit O1 sans téléportation", () => {
    const state = buildPnrCentral();
    const { max } = maxFrameDelta(state, 'D1', 2, 3);
    expect(max).toBeLessThanOrEqual(MAX_FRAME_DELTA_PX);
  });
});
