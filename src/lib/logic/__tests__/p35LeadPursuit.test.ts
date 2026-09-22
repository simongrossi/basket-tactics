// P3.5 — poursuite anticipée : un défenseur en retard (rampe P3.1) coupe
// l'angle vers le point de rencontre au lieu de courir derrière son homme.

import { describe, expect, it } from 'vitest';
import type { AppState, DefenderId } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { distance } from '@/lib/logic/geometry';
import { resolveTimelineFrame } from '../playback/frameResolver';

const SUBSTEPS = 60;

/** Coupe en L : O2 plonge vers la ligne de fond puis file vers l'autre
 *  coin. D2, parti de l'arrêt, est en retard quand O2 change de direction. */
function chaseState(lead: boolean | undefined): AppState {
  const s0 = makeInitialState();
  const start = structuredClone(s0.steps[0]);
  const mid = structuredClone(s0.steps[0]);
  const end = structuredClone(s0.steps[0]);
  mid.off.O2 = { x: 130, y: 510 };
  end.off.O2 = { x: 430, y: 510 };
  start.duration = 1;
  mid.duration = 1;
  return {
    ...s0,
    defenderPlaybackAccelerationEnabled: true,
    defenderLeadPursuitEnabled: lead,
    steps: [start, mid, end],
  };
}

/** Écart moyen entre D2 et sa place idéale (position sans rampe). */
function meanLag(state: AppState, id: DefenderId): number {
  const ideal: AppState = { ...state, defenderPlaybackAccelerationEnabled: undefined, defenderLeadPursuitEnabled: undefined };
  let sum = 0;
  const n = (state.steps.length - 1) * SUBSTEPS;
  for (let k = 1; k <= n; k++) {
    sum += distance(resolveTimelineFrame(state, k / SUBSTEPS)!.defPos[id], resolveTimelineFrame(ideal, k / SUBSTEPS)!.defPos[id]);
  }
  return sum / n;
}

describe('P3.5 — poursuite anticipée (lecture)', () => {
  it('flag absent → identique à la rampe seule', () => {
    const a = chaseState(undefined);
    const b = chaseState(false);
    for (const t of [0.2, 0.5, 1, 1.5, 2]) {
      expect(resolveTimelineFrame(b, t)!.defPos.D2.x).toBeCloseTo(resolveTimelineFrame(a, t)!.defPos.D2.x, 9);
      expect(resolveTimelineFrame(b, t)!.defPos.D2.y).toBeCloseTo(resolveTimelineFrame(a, t)!.defPos.D2.y, 9);
    }
  });

  it('un défenseur en retard rattrape sa place plus vite en coupant l’angle', () => {
    const pure = meanLag(chaseState(undefined), 'D2');
    const lead = meanLag(chaseState(true), 'D2');
    expect(pure).toBeGreaterThan(5); // le scénario crée bien un retard
    expect(lead).toBeLessThan(pure * 0.97);
  });

  it('sans retard, la poursuite anticipée ne change rien (pas de défenseur devant son homme)', () => {
    const s0 = makeInitialState();
    const still: AppState = { ...s0, defenderPlaybackAccelerationEnabled: true, defenderLeadPursuitEnabled: true,
      steps: [structuredClone(s0.steps[0]), structuredClone(s0.steps[0])] };
    const ref: AppState = { ...still, defenderLeadPursuitEnabled: undefined };
    for (const t of [0.3, 0.7, 1]) {
      (Object.keys(resolveTimelineFrame(ref, t)!.defPos) as DefenderId[]).forEach((id) => {
        expect(resolveTimelineFrame(still, t)!.defPos[id].x).toBeCloseTo(resolveTimelineFrame(ref, t)!.defPos[id].x, 9);
      });
    }
  });

  it('modèles classiques : séparation 34 px et aucun saut > 18 px (rampe + anticipation)', () => {
    const templates = TEMPLATES.filter((t) =>
      ['pnr-central', 'horns-flare', 'spain-pnr', 'floppy', 'hammer', 'ucla-cut'].includes(t.id));
    for (const template of templates) {
      const state: AppState = {
        ...makeInitialState(),
        realismProfile: 'realistic',
        defenderPlaybackAccelerationEnabled: true,
        defenderLeadPursuitEnabled: true,
        steps: structuredClone(template.steps),
        defenseInitial: structuredClone(template.defenseInitial),
      };
      let previous: ReturnType<typeof resolveTimelineFrame> = null;
      for (let tick = 0; tick <= (state.steps.length - 1) * SUBSTEPS; tick++) {
        const frame = resolveTimelineFrame(state, tick / SUBSTEPS)!;
        const players = [...Object.entries(frame.off), ...Object.entries(frame.defPos)];
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            expect(distance(players[i][1], players[j][1]), `${template.id} t=${tick} ${players[i][0]}/${players[j][0]}`)
              .toBeGreaterThanOrEqual(34 - 0.01);
          }
          if (previous) {
            const before = [...Object.entries(previous.off), ...Object.entries(previous.defPos)]
              .find(([id]) => id === players[i][0])![1];
            expect(distance(before, players[i][1]), `${template.id} t=${tick} ${players[i][0]} saut`)
              .toBeLessThanOrEqual(18.01);
          }
        }
        previous = frame;
      }
    }
  });
});
