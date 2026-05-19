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

console.log('Trajectoire D1 step 2→3 (avec rate limiter / prevFrame) :');
console.log('  t      D1.x   D1.y    O5.x   O5.y    dist(D1,O5)  D1.phase');
let prev: any = null;
for (let f = 60; f <= 90; f++) {
  const t = f / 30;
  const frame = resolveFrameAt(state as any, t, { prevFrame: prev ?? undefined });
  if (!frame) continue;
  const d = Math.hypot(frame.defPos.D1!.x - frame.off.O5.x, frame.defPos.D1!.y - frame.off.O5.y);
  console.log(`  ${t.toFixed(2)}   ${frame.defPos.D1!.x.toFixed(0).padStart(5)}  ${frame.defPos.D1!.y.toFixed(0).padStart(5)}   ${frame.off.O5.x.toFixed(0).padStart(5)}  ${frame.off.O5.y.toFixed(0).padStart(5)}     ${d.toFixed(1).padStart(5)}     ${frame.defPos.D1?.screenPhase ?? '-'}`);
  prev = frame;
}
