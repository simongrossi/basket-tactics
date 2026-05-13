// Détecte les sauts inter-frame > 20 px dans le playback du Screen Lab.
// Un saut > 20 px en une frame = téléportation visible à l'écran.
//
// Le template Screen Lab est une GALERIE de scénarios. Les transitions
// inter-scènes (ex : Reject → Pindown qui ont des setups complètement
// différents) téléportent forcément les joueurs : c'est par design.
//
// Ce test sert à :
//   1. Repérer les téléports involontaires AU SEIN d'un scénario continu
//      (steps consécutifs avec setup partagé)
//   2. Documenter explicitement les ruptures inter-scène attendues
//
// Si tu vois un saut inattendu, vérifie si :
//   - Les 2 steps utilisent le même setup de base
//   - Le mouvement annoté est physiquement plausible

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';

const ATT_IDS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;
const DEF_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
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

// Seuil de téléport. Au-delà de cette valeur (px par frame), le coach
// perçoit un saut net.
//
// 2026-05-13 — rate limiter dans `resolveFrameAt` (options.prevFrame)
// borne les sauts des défenseurs à MAX_DEFENDER_JUMP_PX = 18 px/frame.
// Test serré à 20 px (= 18 + tolérance 2 px d'erreur d'arrondi/résolveur).
// Avant rate limiter : jumps jusqu'à 68 px sur Lab Snake / 55 sur
// Pindown / 54 sur Stagger.
const MAX_JUMP_PX = 20;

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

LAB_IDS.forEach((tplId) => {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  describe(`🧪 ${tpl.name} — détection téléports inter-frame`, () => {
    it(`tous les joueurs bougent en douceur (< ${MAX_JUMP_PX} px/frame) sur tout le playback`, async () => {
      const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
      const state = buildState(tplId);
      const transitions = tpl.steps.length - 1;
      if (transitions === 0) return;
      const totalFrames = transitions * 60;
      const jumps: Array<{ player: string; frame: number; jump: number; tStep: string }> = [];
      let prevFrame: ReturnType<typeof resolveFrameAt> | null = null;

      for (let f = 0; f <= totalFrames; f++) {
        const t = (f / totalFrames) * transitions;
        // Active le rate limiter (= simule l'usage réel via useCourtFrame).
        const frame = resolveFrameAt(state, t, { prevFrame: prevFrame ?? undefined });
        if (!frame) continue;
        if (prevFrame) {
          for (const id of ATT_IDS) {
            const a = prevFrame.off[id];
            const b = frame.off[id];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (dist > MAX_JUMP_PX) {
              const stepNum = Math.floor(t);
              jumps.push({ player: id, frame: f, jump: dist, tStep: `${stepNum}→${stepNum + 1}` });
            }
          }
          for (const id of DEF_IDS) {
            const a = prevFrame.defPos[id];
            const b = frame.defPos[id];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (dist > MAX_JUMP_PX) {
              const stepNum = Math.floor(t);
              jumps.push({ player: id, frame: f, jump: dist, tStep: `${stepNum}→${stepNum + 1}` });
            }
          }
        }
        prevFrame = frame;
      }

      // Cas pathologique (poseur PILE sur porteur dans Stress) : seuil relâché.
      const allowedJumps = tplId === 'screen-lab-stress'
        ? jumps.filter((j) => j.tStep !== '1→2') // step 02 → 03 = transition vers overlap
        : jumps;

      if (allowedJumps.length > 0) {
        console.log(`\n${tpl.name} — SAUTS > ${MAX_JUMP_PX} px (${allowedJumps.length}) :`);
        allowedJumps.sort((a, b) => b.jump - a.jump).slice(0, 10).forEach((j) => {
          console.log(`  frame ${j.frame} (transition ${j.tStep}) — ${j.player}: ${j.jump.toFixed(1)}px`);
        });
      }
      expect(allowedJumps).toEqual([]);
    });
  });
});
