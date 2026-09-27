// Diagnostic : vitesse sous-pas par sous-pas d'un joueur (m/s) et mémoire de
// mouvement. Usage : npx tsx scripts/diag-kinematics.ts <templateId> <joueur> [t0] [t1]
import { makeInitialState } from '../src/lib/data/initial';
import { TEMPLATES } from '../src/lib/data/templates';
import { PX_PER_M } from '../src/lib/data/court';
import { loadTemplate } from '../src/lib/state/transforms/coreTransforms';
import { resolveTimelineFrame } from '../src/lib/logic/playback/frameResolver';
import { fullStepToSeconds } from '../src/lib/logic/timecode';
import type { Point } from '../src/lib/types';

const [tplId = 'pnr-central', pid = 'D5', t0 = '0', t1 = '99'] = process.argv.slice(2);
const tpl = TEMPLATES.find((t) => t.id === tplId)!;
const state = loadTemplate({ ...makeInitialState(), realismProfile: 'realistic' }, tpl);
const last = state.steps.length - 1;
let prev: Point | null = null;
let prevS = 0;
for (let tick = 0; tick <= last * 60; tick++) {
  const t = tick / 60;
  const f = resolveTimelineFrame(state, t)!;
  const p = (pid.startsWith('O') ? (f.off as Record<string, Point>)[pid] : (f.defPos as Record<string, Point>)[pid]);
  const s = fullStepToSeconds(state, t);
  if (prev && s >= Number(t0) && s <= Number(t1)) {
    const v = Math.hypot(p.x - prev.x, p.y - prev.y) / PX_PER_M / (s - prevS);
    const mem = pid.startsWith('D') ? f.motionMemory?.[pid as 'D1']?.speedPxPerSec : undefined;
    console.log(`${s.toFixed(3)}s t=${t.toFixed(3)} v=${v.toFixed(2)} m/s mem=${mem !== undefined ? (mem / PX_PER_M).toFixed(2) : '-'}`);
  }
  prev = p;
  prevS = s;
}
