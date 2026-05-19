import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import type { AppState } from '../src/lib/types';

const tpl = TEMPLATES.find((t) => t.id === 'horns-flare')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(tpl.steps),
  defenseInitial: structuredClone(tpl.defenseInitial),
  activeStep: 0,
};

console.log('=== Horns flare diagnostic ===\n');
for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
  const t = stepIdx;
  const f = resolveFrameAt(state, t)!;
  console.log(`Step ${stepIdx} — ${state.steps[stepIdx].label}`);
  console.log(`  Porteur : ${f.carrier}`);
  console.log(`  Carrier screen : ${f.screen ? `O${f.screen.screener.slice(-1)} sur ${f.screen.carrierDef}` : 'aucun'}`);
  console.log(`  Off-ball screens : ${f.offBallScreens.length === 0 ? 'aucun' : f.offBallScreens.map(s => `${s.type} ${s.screener}→${s.cutter}`).join(', ')}`);
  Object.entries(f.defPos).forEach(([id, d]) => {
    if (d.screenPhase) console.log(`  ${id} screenPhase = ${d.screenPhase}`);
  });
  console.log(`  O1: (${f.off.O1.x.toFixed(0)}, ${f.off.O1.y.toFixed(0)}) | O5: (${f.off.O5.x.toFixed(0)}, ${f.off.O5.y.toFixed(0)})`);
  console.log(`  D1: (${f.defPos.D1!.x.toFixed(0)}, ${f.defPos.D1!.y.toFixed(0)}) | D5: (${f.defPos.D5!.x.toFixed(0)}, ${f.defPos.D5!.y.toFixed(0)})`);
  const distD1O5 = Math.hypot(f.defPos.D1!.x - f.off.O5.x, f.defPos.D1!.y - f.off.O5.y);
  console.log(`  dist(D1, O5) = ${distD1O5.toFixed(1)} px (screenRadius = 35)`);
  console.log('');
}

// Inter-step : screenPhase aux frames intermédiaires
console.log('--- screenPhase de D1 frame par frame (recherche stuck) ---');
for (let f = 0; f <= 90; f++) {
  const t = f / 30;
  const frame = resolveFrameAt(state, t);
  if (!frame) continue;
  const phase = frame.defPos.D1?.screenPhase;
  if (phase) console.log(`  f=${f.toString().padStart(2)} t=${t.toFixed(2)} D1 phase=${phase}`);
}
