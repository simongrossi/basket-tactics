import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import type { AppState } from '../src/lib/types';

const tpl = TEMPLATES.find((t) => t.id === 'pindown-corner')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(tpl.steps),
  defenseInitial: structuredClone(tpl.defenseInitial),
  activeStep: 0,
};

console.log('=== Pindown corner diagnostic ===\n');
for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
  const f = resolveFrameAt(state, stepIdx)!;
  console.log(`Step ${stepIdx} — ${state.steps[stepIdx].label}`);
  console.log(`  Off-ball screens : ${f.offBallScreens.length === 0 ? 'aucun' : f.offBallScreens.map(s => `${s.type} ${s.screener}→${s.cutter}`).join(', ')}`);
  Object.entries(f.defPos).forEach(([id, d]) => {
    if (d.screenPhase) console.log(`  ${id} screenPhase = ${d.screenPhase}`);
  });
  console.log(`  Positions: O1(${f.off.O1.x.toFixed(0)},${f.off.O1.y.toFixed(0)}) O2(${f.off.O2.x.toFixed(0)},${f.off.O2.y.toFixed(0)}) O4(${f.off.O4.x.toFixed(0)},${f.off.O4.y.toFixed(0)})`);
  console.log(`  Def      : D2(${f.defPos.D2!.x.toFixed(0)},${f.defPos.D2!.y.toFixed(0)}) D4(${f.defPos.D4!.x.toFixed(0)},${f.defPos.D4!.y.toFixed(0)})`);
  console.log(`  dist(D2, D4) = ${Math.hypot(f.defPos.D2!.x - f.defPos.D4!.x, f.defPos.D2!.y - f.defPos.D4!.y).toFixed(1)} px`);
  console.log('');
}

// Frame avec min dist D2↔D4
console.log('--- Frame critique (min dist D2↔D4) ---');
let minD = Infinity; let minT = 0;
let minState: any = null;
for (let f = 0; f <= 90; f++) {
  const t = f / 30;
  const frame = resolveFrameAt(state, t);
  if (!frame) continue;
  const d = Math.hypot(frame.defPos.D2!.x - frame.defPos.D4!.x, frame.defPos.D2!.y - frame.defPos.D4!.y);
  if (d < minD) { minD = d; minT = t; minState = frame; }
}
console.log(`  Min dist D2↔D4 = ${minD.toFixed(1)} px à t=${minT.toFixed(2)}`);
console.log(`  D2(${minState.defPos.D2.x.toFixed(0)},${minState.defPos.D2.y.toFixed(0)}) — D4(${minState.defPos.D4.x.toFixed(0)},${minState.defPos.D4.y.toFixed(0)})`);
console.log(`  D2 phase=${minState.defPos.D2.screenPhase ?? 'none'}, D4 phase=${minState.defPos.D4.screenPhase ?? 'none'}`);
console.log(`  D2 matched=${minState.defPos.D2.matchedTo}, D4 matched=${minState.defPos.D4.matchedTo}`);
