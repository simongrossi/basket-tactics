// Cherche le meilleur placement O5 pour PnR central : 4 critères conjoints.
//   (a) Détectable : dist(D1_step1, O5) < screenRadius=35 px.
//   (b) Sur chemin de D1 (qui pursuit O1 vers (380,310)).
//   (c) Pas de collision avec O1 pendant tout le drive (dist O1↔O5 ≥ 34 px).
//   (d) Proche du porteur au moment de la pose (~50 px max).

import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { MIN_PLAYER_CLEARANCE_PX } from '../src/lib/data/physics';
import type { AppState, AttackerPositions, Annotation } from '../src/lib/types';

const pnrSetup: AttackerPositions = {
  O1: { x: 300, y: 380 }, O2: { x: 130, y: 320 }, O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 }, O5: { x: 310, y: 230 },
};

function distP(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function testO5Pos(o5x: number, o5y: number): { ok: boolean; reasons: string[] } {
  const pnrScreen: AttackerPositions = { ...pnrSetup, O5: { x: o5x, y: o5y } };
  const pnrUse: AttackerPositions = { ...pnrScreen, O1: { x: 380, y: 310 } };
  const pnrRoll: AttackerPositions = { ...pnrUse, O5: { x: 300, y: 180 } };
  const state: AppState = {
    ...makeInitialState(),
    defenseInitial: {
      D1: { x: 300, y: 340 }, D2: { x: 130, y: 280 }, D3: { x: 470, y: 280 },
      D4: { x: 215, y: 240 }, D5: { x: 310, y: 270 },
    },
    steps: [
      { off: pnrSetup, ballCarrier: 'O1', annotations: [] },
      {
        off: pnrScreen, ballCarrier: 'O1',
        annotations: [
          { type: 'cut', fromId: 'O5', toId: null, from: pnrSetup.O5, to: pnrScreen.O5 } as Annotation,
          { type: 'screen', fromId: 'O5', toId: null, from: pnrScreen.O5, to: { x: o5x, y: o5y + 18 } } as Annotation,
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
  const reasons: string[] = [];
  // (a) Détection à t=1.0
  const f1 = resolveFrameAt(state, 1.0)!;
  const distD1_O5_step1 = distP(f1.defPos.D1, f1.off.O5);
  if (distD1_O5_step1 >= 35) reasons.push(`(a) dist(D1,O5)@t1=${distD1_O5_step1.toFixed(1)} ≥ 35 (non détecté)`);
  // (c) Pas de collision O1↔O5 pendant le drive t=1→2
  let minO1_O5 = Infinity;
  let minAtT = 0;
  for (let i = 0; i <= 20; i++) {
    const t = 1 + i / 20;
    const f = resolveFrameAt(state, t);
    if (!f) continue;
    const d = distP(f.off.O1, f.off.O5);
    if (d < minO1_O5) { minO1_O5 = d; minAtT = t; }
  }
  if (minO1_O5 < MIN_PLAYER_CLEARANCE_PX) {
    reasons.push(`(c) min dist(O1,O5)=${minO1_O5.toFixed(1)} à t=${minAtT.toFixed(2)} < clearance ${MIN_PLAYER_CLEARANCE_PX}`);
  }
  // (d) Distance O1↔O5 raisonnable au step 1 (pas trop loin)
  const distO1_O5_step1 = distP(f1.off.O1, f1.off.O5);
  if (distO1_O5_step1 > 80) reasons.push(`(d) dist(O1,O5)@t1=${distO1_O5_step1.toFixed(1)} > 80 (trop loin)`);

  // Critère qualité : screenPhase pendant le drive
  const f15 = resolveFrameAt(state, 1.5);
  const phase15 = f15?.defPos.D1.screenPhase ?? 'none';
  if (phase15 !== 'stuck' && phase15 !== 'impact') {
    reasons.push(`screenPhase@t1.5=${phase15} (devrait être stuck ou impact)`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

// Grille de positions à tester
const candidates: [number, number][] = [
  [320, 355], // actuel buggué
  [320, 350],
  [325, 340],
  [330, 330],
  [335, 320],
  [340, 310],
  [335, 315],
  [330, 320],
  [325, 330],
  [330, 315],
  [335, 305],
  [328, 320],
  [332, 318],
];

console.log('Test des candidats pour pnrScreen.O5 :');
console.log('   (x, y)        ok    raisons si KO');
console.log('   ----------    --    -------------');
for (const [x, y] of candidates) {
  const r = testO5Pos(x, y);
  const tag = r.ok ? '✓' : '✗';
  console.log(`   (${x}, ${y})     ${tag}    ${r.reasons.join(' | ')}`);
}
