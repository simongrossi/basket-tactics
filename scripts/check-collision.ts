import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import { MIN_PLAYER_CLEARANCE_PX } from '../src/lib/data/physics';
import type { AppState } from '../src/lib/types';

const template = TEMPLATES.find((t) => t.id === 'pnr-central')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(template.steps),
  defenseInitial: structuredClone(template.defenseInitial),
  screenRule: 'hedge',
  activeStep: 0,
};

console.log('Vérification collision O1↔O5 sur tout le playback :');
console.log('   t      O1            O5            dist  note');
console.log('   ----   -----------   -----------   ----  ----');
let minDist = Infinity; let minT = 0;
for (let i = 0; i <= 30; i++) {
  const t = i / 10;
  const f = resolveFrameAt(state, t);
  if (!f) continue;
  const d = Math.hypot(f.off.O1.x - f.off.O5.x, f.off.O1.y - f.off.O5.y);
  if (d < minDist) { minDist = d; minT = t; }
  const flag = d < MIN_PLAYER_CLEARANCE_PX ? '❌ OVERLAP' : d < MIN_PLAYER_CLEARANCE_PX + 6 ? '⚠️ très proche' : '';
  console.log(`   ${t.toFixed(2)}   (${f.off.O1.x.toFixed(0)}, ${f.off.O1.y.toFixed(0)})  (${f.off.O5.x.toFixed(0)}, ${f.off.O5.y.toFixed(0)})  ${d.toFixed(1)}  ${flag}`);
}
console.log(`\n→ Min dist(O1, O5) = ${minDist.toFixed(1)} px à t=${minT.toFixed(2)} (clearance=${MIN_PLAYER_CLEARANCE_PX})`);
