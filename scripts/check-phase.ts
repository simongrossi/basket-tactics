import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import type { AppState } from '../src/lib/types';

const template = TEMPLATES.find((t) => t.id === 'pnr-central')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(template.steps),
  defenseInitial: structuredClone(template.defenseInitial),
  screenRule: 'hedge',
  activeStep: 0,
};

console.log('t       screenPhase   dist(D1,O5)');
for (let i = 0; i <= 30; i++) {
  const t = i / 10;
  const f = resolveFrameAt(state, t);
  if (!f) continue;
  const d1 = f.defPos.D1;
  const o5 = f.off.O5;
  const d = Math.hypot(d1.x - o5.x, d1.y - o5.y);
  console.log(`${t.toFixed(2)}    ${(d1.screenPhase ?? 'none').padEnd(12)}  ${d.toFixed(1)}`);
}
