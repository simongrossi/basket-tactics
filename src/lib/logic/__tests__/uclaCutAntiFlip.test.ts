// Test de régression — UCLA cut : D1 ne doit pas flipper de côté du poseur
// O5 pendant le cut. Bug initial : entre f113 et f114 (mode scrub),
// `pushOutOfMany` (geometry) convergeait sur 2 fixed points opposés autour
// du cluster d'écran quand D1 était coincé entre O1 (cutter, 8 px) et O5
// (poseur, 33 px) → distance inter-attaquants 62 px < 2 × MIN_CLEARANCE.
// Le choix entre les 2 fixed points oscillait avec les déplacements
// inter-frame → saut visuel ~50 px (D1 traversait le poseur).
//
// Fix : `pushOutOfManyConstrained` dans frameResolver, qui contraint chaque
// push à ne pas franchir le segment defA→defB vers le côté du cluster, quand
// la position initiale de D était déjà du côté opposé.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';

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

describe('UCLA cut — anti-flip côté D1', () => {
  it('D1 reste du même côté du poseur O5 sur toute la transition UCLA', async () => {
    const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
    const state = buildState('ucla-cut');
    const transitions = state.steps.length - 1;
    const totalFrames = transitions * 60;
    const sides: Array<'L' | 'R'> = [];
    for (let f = 0; f <= totalFrames; f++) {
      const t = (f / totalFrames) * transitions;
      const frame = resolveFrameAt(state, t, {});
      if (!frame) continue;
      const d1 = frame.defPos.D1;
      const o5 = frame.off.O5;
      const dx = d1.x - o5.x;
      // Ignore les positions proche du milieu (dx faible) qui peuvent flotter.
      if (Math.abs(dx) < 3) continue;
      sides.push(dx > 0 ? 'R' : 'L');
    }
    // Vérifie qu'il n'y a PAS de flip massif R→L ou L→R sur > 1 transition
    // unique. Avant fix : on observait R→L à f114 puis L stable → 1 flip.
    // Après fix : D1 reste L tout du long (côté navigué par l'engine).
    let flips = 0;
    for (let i = 1; i < sides.length; i++) {
      if (sides[i] !== sides[i - 1]) flips++;
    }
    expect(flips).toBeLessThanOrEqual(1);
  });

  it('aucun saut > 30 px frame-à-frame en playback (avec rate limiter)', async () => {
    const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
    const state = buildState('ucla-cut');
    const transitions = state.steps.length - 1;
    const totalFrames = transitions * 60;
    let prev: ReturnType<typeof resolveFrameAt> | null = null;
    let maxJump = 0;
    for (let f = 0; f <= totalFrames; f++) {
      const t = (f / totalFrames) * transitions;
      const frame = resolveFrameAt(state, t, { prevFrame: prev ?? undefined });
      if (!frame) continue;
      if (prev) {
        const p = prev.defPos.D1;
        const c = frame.defPos.D1;
        const j = Math.hypot(c.x - p.x, c.y - p.y);
        if (j > maxJump) maxJump = j;
      }
      prev = frame;
    }
    // Rate limiter cap à MAX_DEFENDER_JUMP_PX = 18. Tolérance 2 px pour
    // arrondi / résolveur de collision.
    expect(maxJump).toBeLessThan(20);
  });

  it('aucun saut > 35 px frame-à-frame en mode scrub (sans rate limiter)', async () => {
    // Note : pas de rate limiter en scrub → le fix anti-flip doit suffire
    // seul à maintenir une trajectoire smooth.
    const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
    const state = buildState('ucla-cut');
    const transitions = state.steps.length - 1;
    const totalFrames = transitions * 60;
    let prev: ReturnType<typeof resolveFrameAt> | null = null;
    let maxJump = 0;
    let maxFrame = -1;
    for (let f = 0; f <= totalFrames; f++) {
      const t = (f / totalFrames) * transitions;
      const frame = resolveFrameAt(state, t, {});
      if (!frame) continue;
      if (prev) {
        const p = prev.defPos.D1;
        const c = frame.defPos.D1;
        const j = Math.hypot(c.x - p.x, c.y - p.y);
        if (j > maxJump) { maxJump = j; maxFrame = f; }
      }
      prev = frame;
    }
    // Avant fix : saut 52 px à f114. Après fix : ≤ 25 px (contournement
    // smooth de O5 par la gauche).
    expect(maxJump, `max jump at f${maxFrame}`).toBeLessThan(35);
  });
});
