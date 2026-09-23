// Garde-fou : profil Réaliste (congestion, départ progressif, poursuite
// anticipée) + placement défensif avancé activés ensemble, comme un coach
// qui coche tout. Règle 1 (34 px) et sauts ≤ 18 px sur la lecture.

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { CLASSIC_TEMPLATES } from '@/lib/data/templates';
import { advancedPlacementPatch } from '@/lib/data/defensePresets';
import { loadTemplate } from '@/lib/state/transforms/coreTransforms';
import { distance } from '@/lib/logic/geometry';
import { resolveTimelineFrame } from '../playback/frameResolver';

describe('défense réaliste complète — invariants de lecture', () => {
  it.each(CLASSIC_TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    const state: AppState = {
      ...loadTemplate({ ...makeInitialState(), realismProfile: 'realistic' }, template),
      ...advancedPlacementPatch(true),
    };
    let previous: ReturnType<typeof resolveTimelineFrame> = null;
    for (let tick = 0; tick <= (state.steps.length - 1) * 60; tick++) {
      const frame = resolveTimelineFrame(state, tick / 60)!;
      const players = [...Object.entries(frame.off), ...Object.entries(frame.defPos)];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          expect(distance(players[i][1], players[j][1]), `t=${tick} ${players[i][0]}/${players[j][0]}`)
            .toBeGreaterThanOrEqual(34 - 0.01);
        }
        if (previous) {
          const before = [...Object.entries(previous.off), ...Object.entries(previous.defPos)]
            .find(([id]) => id === players[i][0])![1];
          expect(distance(before, players[i][1]), `t=${tick} ${players[i][0]} saut`).toBeLessThanOrEqual(18.01);
        }
      }
      previous = frame;
    }
  });
});
