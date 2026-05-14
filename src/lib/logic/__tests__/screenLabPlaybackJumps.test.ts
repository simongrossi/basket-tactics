// Garde-fou anti-téléport central — échantillonne chaque transition à 60 fps
// (mode playback réel, avec rate limiter) sur les Labs dev ET les playbooks
// classiques (UCLA cut, PnR central, etc.). Pour chaque saut > MAX_JUMP_PX,
// logge le CONTEXTE de décision (`screenMode`, `clusterId`, `pushMode`,
// `forcedPushSign`, etc.) au frame fautif ET au frame précédent — pour voir
// directement ce qui a changé.
//
// Sans ces logs, le diagnostic se faisait à l'œil step-by-step en lecture
// dans le dev mode, ce qui est lent et peu reproductible. Avec, on voit :
//   "D2 a sauté 47 px à f87 parce que clusterId est passé de D4 à D5"
//   "D1 a sauté à f114 parce que pushMode est passé de constrained à naive"
// → la cause racine ressort instantanément.
//
// Le test est strict : aucun saut > 20 px toléré (rate limiter cap à 18 +
// 2 px tolerance arrondi). Toute régression future provoquera un dump
// détaillé du contexte de décision dans la sortie d'erreur.
//
// Note : les transitions inter-scènes des Labs galerie (ex Reject → Pindown)
// téléportent forcément les joueurs — listées explicitement dans
// `ALLOWED_INTER_SCENE_JUMPS` pour ne pas être considérées comme régressions.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, DefenderId } from '@/lib/types';
import type { FrameDebug } from '@/lib/logic/playback/frameResolver';

const ATT_IDS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
const DEF_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;

/** Labs dev — galeries de scénarios pour stress tester l'engine d'écran. */
const LAB_IDS = [
  'screen-lab-pnr',
  'screen-lab-snake',
  'screen-lab-reject',
  'screen-lab-pindown',
  'screen-lab-offball',
  'screen-lab-help-recover',
  'screen-lab-chain-rescreen',
  'screen-lab-chain-stagger',
  'screen-lab-stress',
] as const;

/** Playbooks classiques (= templates utilisateurs). Toute régression visible
 *  par un coach utilisant le produit doit casser le test. */
const CLASSIC_IDS = [
  'pnr-central',
  'horns-flare',
  'pindown-corner',
  'spain-pnr',
  'ucla-cut',
  'floppy',
  'hammer',
] as const;

const ALL_IDS = [...LAB_IDS, ...CLASSIC_IDS] as const;

// Seuil de téléport. Au-delà = saut net visible.
// Rate limiter de `resolveFrameAt` clamp à MAX_DEFENDER_JUMP_PX = 18 ;
// tolérance 2 px pour erreurs d'arrondi du résolveur de collisions.
const MAX_JUMP_PX = 20;

/** Transitions inter-scène attendues dans les Labs galerie (setup totalement
 *  différent entre deux scénarios juxtaposés). À documenter explicitement
 *  pour éviter qu'un fix les rende silencieusement absents. */
const ALLOWED_INTER_SCENE_JUMPS: Partial<Record<string, ReadonlyArray<string>>> = {
  'screen-lab-stress': ['1→2'],
};

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

interface JumpRecord {
  player: string;
  frame: number;
  jump: number;
  tStep: string;
  prevDebug: FrameDebug['defenders'][DefenderId] | undefined;
  curDebug: FrameDebug['defenders'][DefenderId] | undefined;
}

function decisionDiff(
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

ALL_IDS.forEach((tplId) => {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  describe(`${tpl.name} (${tplId}) — anti-téléport`, () => {
    it(`tous les joueurs bougent en douceur (< ${MAX_JUMP_PX} px/frame) sur tout le playback`, async () => {
      const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
      const state = buildState(tplId);
      const transitions = tpl.steps.length - 1;
      if (transitions === 0) return;
      const totalFrames = transitions * 60;
      const jumps: JumpRecord[] = [];
      let prevFrame: ReturnType<typeof resolveFrameAt> | null = null;

      for (let f = 0; f <= totalFrames; f++) {
        const t = (f / totalFrames) * transitions;
        const frame = resolveFrameAt(state, t, {
          prevFrame: prevFrame ?? undefined,
          collectDecisions: true,
        });
        if (!frame) continue;
        if (prevFrame) {
          const stepNum = Math.floor(t);
          const tStep = `${stepNum}→${stepNum + 1}`;
          for (const id of ATT_IDS) {
            const a = prevFrame.off[id];
            const b = frame.off[id];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (dist > MAX_JUMP_PX) {
              jumps.push({ player: id, frame: f, jump: dist, tStep, prevDebug: undefined, curDebug: undefined });
            }
          }
          for (const id of DEF_IDS) {
            const a = prevFrame.defPos[id];
            const b = frame.defPos[id];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (dist > MAX_JUMP_PX) {
              jumps.push({
                player: id,
                frame: f,
                jump: dist,
                tStep,
                prevDebug: prevFrame.debug?.defenders[id],
                curDebug: frame.debug?.defenders[id],
              });
            }
          }
        }
        prevFrame = frame;
      }

      // Filtrage des transitions inter-scène documentées (Labs galerie).
      const exemptions = ALLOWED_INTER_SCENE_JUMPS[tplId] ?? [];
      const flagged = jumps.filter((j) => !exemptions.includes(j.tStep));

      if (flagged.length > 0) {
        const top = flagged.sort((a, b) => b.jump - a.jump).slice(0, 5);
        const lines = [
          ``,
          `${tpl.name} — ${flagged.length} saut(s) > ${MAX_JUMP_PX} px détecté(s).`,
          `Top ${Math.min(5, top.length)} :`,
        ];
        top.forEach((j) => {
          lines.push(
            `  f${j.frame} (${j.tStep}) ${j.player}: ${j.jump.toFixed(1)}px`
          );
          if (j.prevDebug || j.curDebug) {
            lines.push(`    Δ décision: ${decisionDiff(j.prevDebug, j.curDebug)}`);
            if (j.curDebug) {
              lines.push(
                `    contexte cur: mode=${j.curDebug.screenMode} q=${j.curDebug.quality} ` +
                  `curve=${j.curDebug.curveBranch} cluster=${j.curDebug.clusterId} ` +
                  `push=${j.curDebug.pushMode} sign=${j.curDebug.forcedPushSign} ` +
                  `matched=${j.curDebug.matchedTo} late=${j.curDebug.late} ` +
                  `offBall=${j.curDebug.offBallContactType}`
              );
            }
          }
        });
        console.error(lines.join('\n'));
      }
      expect(flagged).toEqual([]);
    });
  });
});
