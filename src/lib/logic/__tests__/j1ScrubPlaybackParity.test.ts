// J.1 — Parité scrub ↔ playback.
//
// Vérifie que pour un même t global, resolveFrameAt (playback) et
// resolveFrameAtDeterministicScrub (scrub) produisent des positions et
// flags clés cohérents. Une tolérance positionnelle est acceptée car :
//  - playback : prevFrame est issu de la trajectoire réelle (peut être
//    f-30 frames en arrière)
//  - scrub : prevFrame synthétique reconstruit à 60fps depuis le step
//    entier précédent
//
// Ces deux mémoires peuvent diverger légèrement sur les flags type
// `screenMemory.forcedPushSign`. Le but de ce test est d'attraper les
// gros écarts (> 25 px ou flags catégoriels différents).

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import {
  resolveFrameAt,
  resolveFrameAtDeterministicScrub,
  type PlaybackFrame,
} from '@/lib/logic/playback/frameResolver';

const PARITY_TEMPLATES = ['ucla-cut', 'pnr-central', 'pindown-corner'] as const;

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  return {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    activeStep: 0,
  };
}

/** Joue le playback de t=0 à t=tTarget en chaînant prevFrame (60fps),
 *  retourne la frame finale. */
function playbackUntil(state: AppState, tTarget: number): PlaybackFrame | null {
  const fps = 60;
  const totalSteps = state.steps.length - 1;
  const target = Math.min(totalSteps, Math.max(0, tTarget));
  const totalFrames = Math.max(1, Math.round(target * fps));
  let prev: PlaybackFrame | null = null;
  let final: PlaybackFrame | null = null;
  for (let f = 0; f <= totalFrames; f++) {
    const t = (f / totalFrames) * target;
    const frame = resolveFrameAt(state, t, { prevFrame: prev ?? undefined });
    if (!frame) continue;
    prev = frame;
    final = frame;
  }
  return final;
}

/** Distance max entre deux ensembles de positions (attaquants + défenseurs). */
function maxPositionDelta(a: PlaybackFrame, b: PlaybackFrame): { delta: number; pair: string } {
  let max = 0;
  let worstPair = '';
  Object.keys(a.off).forEach((id) => {
    const pa = a.off[id as keyof typeof a.off];
    const pb = b.off[id as keyof typeof b.off];
    if (!pa || !pb) return;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (d > max) { max = d; worstPair = `off.${id}`; }
  });
  Object.keys(a.defPos).forEach((id) => {
    const pa = a.defPos[id as keyof typeof a.defPos];
    const pb = b.defPos[id as keyof typeof b.defPos];
    if (!pa || !pb) return;
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (d > max) { max = d; worstPair = `def.${id}`; }
  });
  return { delta: max, pair: worstPair };
}

describe('J.1 — parité scrub ↔ playback (positions)', () => {
  for (const tplId of PARITY_TEMPLATES) {
    it(`positions playback ≈ scrub pour ${tplId} (écart max < 25px)`, () => {
      const state = buildState(tplId);
      const samples = [0.25, 0.5, 0.75, 1.0, 1.5];
      for (const t of samples) {
        const tClamped = Math.min(state.steps.length - 1, t);
        const fromPlayback = playbackUntil(state, tClamped);
        const fromScrub = resolveFrameAtDeterministicScrub(state, tClamped);
        if (!fromPlayback || !fromScrub) continue;
        const { delta, pair } = maxPositionDelta(fromPlayback, fromScrub);
        expect(delta, `${tplId} @ t=${t} pire paire=${pair}`).toBeLessThan(25);
      }
    });

    it(`carrier identique playback/scrub pour ${tplId}`, () => {
      const state = buildState(tplId);
      const samples = [0.25, 0.5, 0.75];
      for (const t of samples) {
        const tClamped = Math.min(state.steps.length - 1, t);
        const p = playbackUntil(state, tClamped);
        const s = resolveFrameAtDeterministicScrub(state, tClamped);
        if (!p || !s) continue;
        expect(s.carrier, `${tplId} @ t=${t}`).toBe(p.carrier);
      }
    });
  }
});

describe('J.1 — parité options scrub/playback', () => {
  it('resolveFrameAtDeterministicScrub accepte les mêmes options que resolveFrameAt', () => {
    const state = buildState('ucla-cut');
    // Doit accepter collectDecisions + profile sans erreur.
    const frame = resolveFrameAtDeterministicScrub(state, 0.5, {
      stepIdx: 1,
      collectDecisions: true,
      profile: true,
    });
    expect(frame).not.toBeNull();
    expect(frame?.debug).toBeDefined();
    expect(frame?.profile).toBeDefined();
  });

  it("sans options diagnostic → frame.debug et frame.profile undefined", () => {
    const state = buildState('ucla-cut');
    const frame = resolveFrameAtDeterministicScrub(state, 0.5);
    expect(frame?.debug).toBeUndefined();
    expect(frame?.profile).toBeUndefined();
  });
});
