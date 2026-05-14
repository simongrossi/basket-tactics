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
import type { AppState } from '@/lib/types';
import {
  collectPlaybackJumpDiagnostics,
  formatPlaybackJumpDiagnostics,
} from '@/lib/logic/playbackDiagnostics';

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

ALL_IDS.forEach((tplId) => {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  describe(`${tpl.name} (${tplId}) — anti-téléport`, () => {
    it(`tous les joueurs bougent en douceur (< ${MAX_JUMP_PX} px/frame) sur tout le playback`, async () => {
      const state = buildState(tplId);
      const jumps = collectPlaybackJumpDiagnostics(state, {
        fps: 60,
        maxJumpPx: MAX_JUMP_PX,
        collectDecisions: true,
      });

      // Filtrage des transitions inter-scène documentées (Labs galerie).
      const exemptions = ALLOWED_INTER_SCENE_JUMPS[tplId] ?? [];
      const flagged = jumps.filter((j) => !exemptions.includes(j.tStep));

      if (flagged.length > 0) {
        console.error(formatPlaybackJumpDiagnostics(tpl.name, flagged, MAX_JUMP_PX));
      }
      expect(flagged).toEqual([]);
    });
  });
});
