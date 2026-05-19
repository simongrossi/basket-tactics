import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import type { AppState } from '../src/lib/types';

const tpl = TEMPLATES.find((t) => t.id === 'ucla-cut')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(tpl.steps),
  defenseInitial: structuredClone(tpl.defenseInitial),
  activeStep: 0,
};

console.log('=== UCLA cut diagnostic ===\n');
for (let stepIdx = 0; stepIdx < state.steps.length; stepIdx++) {
  const t = stepIdx;
  const f = resolveFrameAt(state, t)!;
  console.log(`\nStep ${stepIdx} (t=${t}) — ${state.steps[stepIdx].label}`);
  console.log(`  Porteur : ${f.carrier}`);
  console.log(`  Carrier screen détecté : ${f.screen ? `O${f.screen.screener.slice(-1)} sur ${f.screen.carrierDef}` : 'AUCUN'}`);
  console.log(`  Off-ball screens : ${f.offBallScreens.length === 0 ? 'AUCUN' : f.offBallScreens.map(s => `${s.type} ${s.screener}→${s.cutter}`).join(', ')}`);
  console.log(`  O1: (${f.off.O1.x.toFixed(0)}, ${f.off.O1.y.toFixed(0)}) | O5: (${f.off.O5.x.toFixed(0)}, ${f.off.O5.y.toFixed(0)})`);
  console.log(`  D1: (${f.defPos.D1!.x.toFixed(0)}, ${f.defPos.D1!.y.toFixed(0)}) | D5: (${f.defPos.D5!.x.toFixed(0)}, ${f.defPos.D5!.y.toFixed(0)})`);
  const distD1O5 = Math.hypot(f.defPos.D1!.x - f.off.O5.x, f.defPos.D1!.y - f.off.O5.y);
  console.log(`  dist(D1, O5) = ${distD1O5.toFixed(1)} px (screenRadius = 35)`);
}
