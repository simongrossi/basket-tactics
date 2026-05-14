import type { AppState, DefenderId } from '@/lib/types';
import {
  resolveFrameAt,
  type FrameDebug,
  type PlaybackFrame,
} from './playback/frameResolver';

export interface PlaybackJumpDiagnostic {
  player: string;
  kind: 'attacker' | 'defender';
  frame: number;
  jump: number;
  tStep: string;
  prevDebug: FrameDebug['defenders'][DefenderId] | undefined;
  curDebug: FrameDebug['defenders'][DefenderId] | undefined;
}

export function collectPlaybackJumpDiagnostics(
  state: AppState,
  options: {
    fps?: number;
    maxJumpPx?: number;
    collectDecisions?: boolean;
  } = {}
): PlaybackJumpDiagnostic[] {
  const fps = options.fps ?? 60;
  const maxJumpPx = options.maxJumpPx ?? 20;
  const transitions = state.steps.length - 1;
  if (transitions <= 0) return [];

  const totalFrames = transitions * fps;
  const jumps: PlaybackJumpDiagnostic[] = [];
  let prevFrame: PlaybackFrame | null = null;

  for (let f = 0; f <= totalFrames; f++) {
    const t = (f / totalFrames) * transitions;
    const frame = resolveFrameAt(state, t, {
      prevFrame: prevFrame ?? undefined,
      collectDecisions: options.collectDecisions ?? true,
    });
    if (!frame) continue;
    if (prevFrame) {
      const stepNum = Math.floor(t);
      const tStep = `${stepNum}→${stepNum + 1}`;
      Object.entries(frame.off).forEach(([id, b]) => {
        const a = prevFrame?.off[id as keyof typeof frame.off];
        if (!a) return;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist > maxJumpPx) {
          jumps.push({
            player: id,
            kind: 'attacker',
            frame: f,
            jump: dist,
            tStep,
            prevDebug: undefined,
            curDebug: undefined,
          });
        }
      });
      (Object.entries(frame.defPos) as [DefenderId, PlaybackFrame['defPos'][DefenderId]][]).forEach(([id, b]) => {
        const a = prevFrame?.defPos[id];
        if (!a) return;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist > maxJumpPx) {
          jumps.push({
            player: id,
            kind: 'defender',
            frame: f,
            jump: dist,
            tStep,
            prevDebug: prevFrame?.debug?.defenders[id],
            curDebug: frame.debug?.defenders[id],
          });
        }
      });
    }
    prevFrame = frame;
  }

  return jumps;
}

export function decisionDiff(
  a: FrameDebug['defenders'][DefenderId] | undefined,
  b: FrameDebug['defenders'][DefenderId] | undefined
): string {
  if (!a && !b) return '<no debug>';
  if (!a) return `appeared: ${JSON.stringify(b)}`;
  if (!b) return `disappeared from: ${JSON.stringify(a)}`;
  const diffs: string[] = [];
  (Object.keys(b) as Array<keyof typeof b>).forEach((k) => {
    if (a[k] !== b[k]) diffs.push(`${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
  });
  return diffs.length ? diffs.join(', ') : '<unchanged>';
}

export function formatPlaybackJumpDiagnostics(
  title: string,
  jumps: PlaybackJumpDiagnostic[],
  maxJumpPx: number,
  maxRows: number = 5
): string {
  const top = [...jumps].sort((a, b) => b.jump - a.jump).slice(0, maxRows);
  const lines = [
    '',
    `${title} — ${jumps.length} saut(s) > ${maxJumpPx} px détecté(s).`,
    `Top ${Math.min(maxRows, top.length)} :`,
  ];
  top.forEach((j) => {
    lines.push(`  f${j.frame} (${j.tStep}) ${j.player}: ${j.jump.toFixed(1)}px`);
    if (j.prevDebug || j.curDebug) {
      lines.push(`    Δ décision: ${decisionDiff(j.prevDebug, j.curDebug)}`);
      if (j.curDebug) {
        lines.push(
          `    contexte cur: mode=${j.curDebug.screenMode} state=${j.curDebug.screenState} q=${j.curDebug.quality} ` +
            `route=${j.curDebug.routeKind} memory=${j.curDebug.memoryUsed} ` +
            `curve=${j.curDebug.curveBranch} cluster=${j.curDebug.clusterId} ` +
            `push=${j.curDebug.pushMode} sign=${j.curDebug.forcedPushSign} ` +
            `matched=${j.curDebug.matchedTo} late=${j.curDebug.late} ` +
            `jump=${j.curDebug.lastJumpPx?.toFixed(1) ?? '-'} ` +
            `offBall=${j.curDebug.offBallContactType}`
        );
      }
    }
  });
  return lines.join('\n');
}
