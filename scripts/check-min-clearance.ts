import { makeInitialState } from '../src/lib/data/initial';
import { resolveFrameAt, type PlaybackFrame } from '../src/lib/logic/playback/frameResolver';
import { TEMPLATES } from '../src/lib/data/templates';
import type { AppState, Point } from '../src/lib/types';

const template = TEMPLATES.find((t) => t.id === 'pnr-central')!;
const state: AppState = {
  ...makeInitialState(),
  steps: structuredClone(template.steps),
  defenseInitial: structuredClone(template.defenseInitial),
  screenRule: 'hedge',
  activeStep: 0,
};

let minDist = Infinity;
let minInfo = '';
const fps = 30;
const totalFrames = (state.steps.length - 1) * fps;
let prevFrame: PlaybackFrame | null = null;
for (let f = 0; f <= totalFrames; f++) {
  const t = f / fps;
  const frame = resolveFrameAt(state, t, { prevFrame: prevFrame ?? undefined, collectDecisions: true });
  if (!frame) continue;
  const players: { id: string; p: Point }[] = [
    ...Object.entries(frame.off).map(([id, p]) => ({ id, p: p as Point })),
    ...Object.entries(frame.defPos).map(([id, p]) => ({ id, p: { x: p.x, y: p.y } })),
  ];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const d = Math.hypot(players[i].p.x - players[j].p.x, players[i].p.y - players[j].p.y);
      if (d < minDist) {
        minDist = d;
        minInfo = `frame ${f} (t=${t.toFixed(3)}): ${players[i].id}(${players[i].p.x.toFixed(0)},${players[i].p.y.toFixed(0)}) — ${players[j].id}(${players[j].p.x.toFixed(0)},${players[j].p.y.toFixed(0)})`;
      }
    }
  }
  prevFrame = frame;
}
console.log(`Min clearance = ${minDist.toFixed(1)} px`);
console.log(`  ${minInfo}`);
