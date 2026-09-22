// P3.1-V1 — rampe d'accélération des défenseurs en lecture.
// Sans elle, un défenseur à l'arrêt atteint sa vitesse de croisière dès le
// premier sous-pas (l'inertie de virage ne s'applique qu'en mouvement).

import { describe, expect, it } from 'vitest';
import type { AppState, DefenderId } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { PX_PER_M } from '@/lib/data/physics';
import { getStepDurationSeconds } from '@/lib/logic/timecode';
import { distance } from '@/lib/logic/geometry';
import { resolveTimelineFrame } from '../playback/frameResolver';

const SUBSTEPS = 60;

/** Porteur O1 qui traverse vite le terrain : D1 part de l'arrêt en sprint. */
function sprintState(rampEnabled: boolean | undefined): AppState {
  const s0 = makeInitialState();
  const start = structuredClone(s0.steps[0]);
  const end = structuredClone(s0.steps[0]);
  end.off.O1 = { x: 540, y: 480 };
  start.duration = 1;
  return { ...s0, defenderPlaybackAccelerationEnabled: rampEnabled, steps: [start, end] };
}

function substepDisplacements(state: AppState, id: DefenderId, count: number): number[] {
  const out: number[] = [];
  let prev = resolveTimelineFrame(state, 0)!.defPos[id];
  for (let i = 1; i <= count; i++) {
    const cur = resolveTimelineFrame(state, i / SUBSTEPS)!.defPos[id];
    out.push(distance(prev, cur));
    prev = cur;
  }
  return out;
}

describe('P3.1 — rampe d’accélération des défenseurs (lecture)', () => {
  it('flag absent ou false → frames strictement identiques', () => {
    const a = sprintState(undefined);
    const b = sprintState(false);
    for (const t of [0.1, 0.35, 0.8, 1]) {
      const fa = resolveTimelineFrame(a, t)!;
      const fb = resolveTimelineFrame(b, t)!;
      (Object.keys(fa.defPos) as DefenderId[]).forEach((id) => {
        expect(fb.defPos[id].x).toBeCloseTo(fa.defPos[id].x, 9);
        expect(fb.defPos[id].y).toBeCloseTo(fa.defPos[id].y, 9);
      });
    }
  });

  it('depuis l’arrêt, D1 accélère progressivement (pas de vitesse max au 1er sous-pas)', () => {
    const state = sprintState(true);
    const dt = getStepDurationSeconds(state, 0) / SUBSTEPS;
    // défaut 4,5 m/s², au plus ×1,2 si le défenseur voit son homme (V4).
    const accelPx = 4.5 * 1.2 * PX_PER_M;
    const steps = substepDisplacements(state, 'D1', 8);
    // Sous-pas k : au plus la vitesse acquise après k × dt, plus une marge
    // pour la résolution de collisions en aval.
    steps.forEach((d, k) => {
      expect(d, `sous-pas ${k + 1}`).toBeLessThanOrEqual(accelPx * dt * dt * (k + 1) + 0.5);
    });
    expect(steps[7]).toBeGreaterThan(steps[0]);
  });

  it('sans rampe, le 1er sous-pas part déjà beaucoup plus vite', () => {
    const withRamp = substepDisplacements(sprintState(true), 'D1', 1)[0];
    const without = substepDisplacements(sprintState(undefined), 'D1', 1)[0];
    expect(without).toBeGreaterThan(withRamp * 2);
  });

  it('modèles classiques : séparation 34 px et aucun saut > 18 px avec la rampe', () => {
    const templates = TEMPLATES.filter((t) =>
      ['pnr-central', 'horns-flare', 'spain-pnr', 'floppy', 'hammer', 'screen-lab-pnr'].includes(t.id));
    for (const template of templates) {
      const state: AppState = {
        ...makeInitialState(),
        realismProfile: 'realistic',
        defenderPlaybackAccelerationEnabled: true,
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

  it('poursuite V4 : un défenseur élite démarre plus vite qu’un défenseur lent', () => {
    const run = (profile: 'elite' | 'lent') => {
      const state = { ...sprintState(true), defenderSpeedProfiles: { D1: profile } };
      return substepDisplacements(state, 'D1', 10).reduce((a, b) => a + b, 0);
    };
    expect(run('elite')).toBeGreaterThan(run('lent') * 1.3);
  });
});
