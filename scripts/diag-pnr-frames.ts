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
// Fix 2026-05-19 — repositionnement pour vrai écran (vs (290,340) avant)
const pnrScreen: AttackerPositions = { ...pnrSetup, O5: { x: 340, y: 320 } };
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

// =========================================================================
// Diagnostic ciblé O1 (porteur) sur TOUT le playback
// Le user signale qu'O1 "revient en arrière" à partir de f119.
// f119 à 60fps × 2s/step = step 0→1 boundary, à 30fps = step 2→3.
// On scrute tout le playback pour identifier le frame de reverse.
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log('DIAGNOSTIC O1 — recherche de reverse (tout le playback)');
console.log('='.repeat(80));
{
  const state = buildState(true);
  console.log('\n  t (step)  O1.x    O1.y     Δx       Δy     Δ(O1)   note');
  console.log('  --------  -----   -----   -----   ------   -----   ----');
  let prevO1: { x: number; y: number } | null = null;
  // Tout le playback t=0 → t=3, échantillonné à 40 points par step.
  const total = 3 * 40;
  for (let i = 0; i <= total; i++) {
    const t = (i / 40);
    const frame = resolveFrameAt(state, t);
    if (!frame) continue;
    const O1 = frame.off.O1;
    const dx = prevO1 ? O1.x - prevO1.x : 0;
    const dy = prevO1 ? O1.y - prevO1.y : 0;
    const dTotal = Math.hypot(dx, dy);
    // Notes : on cherche tout RETOUR en arrière (x diminue après avoir augmenté,
    // ou y augmente après avoir diminué).
    const note = prevO1 && dx < -0.5 ? `⬅️ x recule de ${dx.toFixed(1)}`
      : prevO1 && dy > 0.5 ? `⬇️ y avance vers le fond (+${dy.toFixed(1)})`
      : prevO1 && dTotal > 4 ? `⚠️ jump ${dTotal.toFixed(1)} px`
      : '';
    // Print uniquement si mouvement OU si transition importante (boundary)
    if (dTotal > 0.1 || (i % 5 === 0)) {
      console.log(`  ${t.toFixed(3)}   ${O1.x.toFixed(1).padStart(5)}  ${O1.y.toFixed(1).padStart(5)}   ${dx >= 0 ? '+' : ''}${dx.toFixed(1).padStart(5)}   ${dy >= 0 ? '+' : ''}${dy.toFixed(1).padStart(5)}   ${dTotal.toFixed(1).padStart(5)}   ${note}`);
    }
    prevO1 = O1;
  }
}

// =========================================================================
// Qualité de l'écran O5 au step 1 — où est précisément O5 par rapport à D1
// et à la trajectoire d'O1 ? L'écran est-il "sur le chemin" du drive ?
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log('QUALITÉ DE L\'ÉCRAN — positions clés step 1 (pose)');
console.log('='.repeat(80));
{
  const state = buildState(true);
  // Frame juste après que l'écran soit "posé" (step 1)
  const frame = resolveFrameAt(state, 1.0);
  if (frame) {
    const O1 = frame.off.O1;
    const O5 = frame.off.O5;
    const D1 = frame.defPos.D1!;
    const D5 = frame.defPos.D5!;
    console.log(`\n  À t=1.0 (step 1 — O5 a posé l'écran) :`);
    console.log(`    O1 (porteur)         : (${O1.x.toFixed(0)}, ${O1.y.toFixed(0)})`);
    console.log(`    O5 (poseur)          : (${O5.x.toFixed(0)}, ${O5.y.toFixed(0)})`);
    console.log(`    D1 (def porteur)     : (${D1.x.toFixed(0)}, ${D1.y.toFixed(0)})`);
    console.log(`    D5 (def poseur)      : (${D5.x.toFixed(0)}, ${D5.y.toFixed(0)})`);
    console.log(`    dist(O1, O5)         : ${dist(O1, O5).toFixed(1)} px (faible = écran proche du porteur)`);
    console.log(`    dist(D1, O5)         : ${dist(D1, O5).toFixed(1)} px`);
    console.log(`    O5 est entre O1 et D1 ? écart latéral O5↔ligne(O1,D1) : ${perpDistToLine(O5, O1, D1).toFixed(1)} px`);
    // O1 drive de step 1 (380,310 ... non wait, step 1 O1 reste à 300,380.
    // O1 drive au step 2 vers 380,310. Donc trajectoire drive: (300,380)→(380,310).
    const driveStart = { x: 300, y: 380 };
    const driveEnd = { x: 380, y: 310 };
    console.log(`    Trajectoire drive prévue : (300,380) → (380,310)`);
    console.log(`    O5 est à ${perpDistToLine(O5, driveStart, driveEnd).toFixed(1)} px de cette ligne`);
    console.log(`    → l'écran "couvre" la trajectoire de drive si cette distance < ~30 px`);
  }
}

function perpDistToLine(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return dist(p, a);
  return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}
