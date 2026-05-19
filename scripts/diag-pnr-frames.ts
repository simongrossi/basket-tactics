// Diagnostic frame-level : mesure la trajectoire RÉELLE de D1 entre les
// step targets, telle que produite par `resolveFrameAt`. Détecte si la
// `curveAroundObstacle` fire et dévie effectivement D1 autour d'O5.
//
// Usage : npx tsx scripts/diag-pnr-frames.ts

import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { MIN_PLAYER_CLEARANCE_PX } from '../src/lib/data/physics';
import type { AppState, AttackerPositions, DefenderPositions, Annotation } from '../src/lib/types';

const pnrSetup: AttackerPositions = {
  O1: { x: 300, y: 380 }, O2: { x: 130, y: 320 }, O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 }, O5: { x: 310, y: 230 },
};
const pnrScreen: AttackerPositions = { ...pnrSetup, O5: { x: 290, y: 340 } };
const pnrUse: AttackerPositions = { ...pnrScreen, O1: { x: 380, y: 310 } };
const pnrRoll: AttackerPositions = { ...pnrUse, O5: { x: 300, y: 180 } };

const defenseInitial: DefenderPositions = {
  D1: { x: pnrSetup.O1.x, y: pnrSetup.O1.y - 40 },
  D2: { x: pnrSetup.O2.x, y: pnrSetup.O2.y - 40 },
  D3: { x: pnrSetup.O3.x, y: pnrSetup.O3.y - 40 },
  D4: { x: pnrSetup.O4.x, y: pnrSetup.O4.y + 40 },
  D5: { x: pnrSetup.O5.x, y: pnrSetup.O5.y + 40 },
};

function buildState(useSteeringEngine: boolean): AppState {
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
    useSteeringEngine,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function profileTransition(state: AppState, tStart: number, tEnd: number, label: string) {
  console.log(`\nTransition ${label} (t ∈ [${tStart}, ${tEnd}]):`);
  console.log('  t      D1.x   D1.y    O1.x   O1.y    O5.x   O5.y    d(D1,O5)  d(D1,O1)   note');
  console.log('  ----   -----  -----   -----  -----   -----  -----   -------   --------   ----');

  let minDistO5 = Infinity;
  let minTO5 = 0;
  let prevD1: { x: number; y: number } | null = null;
  for (let i = 0; i <= 20; i++) {
    const t = tStart + (i / 20) * (tEnd - tStart);
    const frame = resolveFrameAt(state, t);
    if (!frame) continue;
    const D1 = frame.defPos.D1!;
    const O1 = frame.off.O1;
    const O5 = frame.off.O5;
    const dO5 = dist(D1, O5);
    const dO1 = dist(D1, O1);
    if (dO5 < minDistO5) { minDistO5 = dO5; minTO5 = t; }
    const velFrame = prevD1 ? dist(prevD1, D1) : 0;
    const note = dO5 < MIN_PLAYER_CLEARANCE_PX ? '❌ <clearance'
      : Math.abs(dO5 - MIN_PLAYER_CLEARANCE_PX) < 0.5 ? '🔒 stuck'
      : velFrame > 12 ? `⚠️ Δ${velFrame.toFixed(0)}px`
      : '';
    console.log(`  ${t.toFixed(2)}   ${D1.x.toFixed(0).padStart(5)}  ${D1.y.toFixed(0).padStart(5)}   ${O1.x.toFixed(0).padStart(5)}  ${O1.y.toFixed(0).padStart(5)}   ${O5.x.toFixed(0).padStart(5)}  ${O5.y.toFixed(0).padStart(5)}   ${dO5.toFixed(1).padStart(7)}   ${dO1.toFixed(1).padStart(7)}   ${note}`);
    prevD1 = D1;
  }
  console.log(`  → Min dist(D1,O5) = ${minDistO5.toFixed(1)} px à t=${minTO5.toFixed(2)}`);
}

function profile(label: string, useSteeringEngine: boolean) {
  const state = buildState(useSteeringEngine);
  console.log('\n' + '='.repeat(80));
  console.log(`FRAME PROFILE: ${label}`);
  console.log('='.repeat(80));

  profileTransition(state, 0, 1, 'step 0 → step 1 (PnR setup → O5 monte)');
  profileTransition(state, 1, 2, 'step 1 → step 2 (O1 utilise écran, drive droite)');
  profileTransition(state, 2, 3, 'step 2 → step 3 (Roll : O5 plonge vers panier)');
}

profile('PNR central — LEGACY (flag off)', false);
profile('PNR central — CVT (flag on)', true);
