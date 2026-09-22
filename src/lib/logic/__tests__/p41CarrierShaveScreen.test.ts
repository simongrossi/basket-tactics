// P4.1 — le porteur frôle son écran (épaule contre épaule).
// Audit 2026-09-22 : déjà obtenu par l'évitement fidèle au tracé (F09) et la
// séparation finale (F11) — le porteur passe à 34 px du poseur. Ce test
// verrouille le contrat : un contournement large rendrait l'écran inutile.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerId } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { distance } from '@/lib/logic/geometry';
import { resolveTimelineFrame } from '../playback/frameResolver';

const CASES: [string, AttackerId, AttackerId][] = [
  ['pnr-central', 'O1', 'O5'],
  ['spain-pnr', 'O1', 'O5'],
  ['pnr-wing', 'O1', 'O4'],
];

describe('P4.1 — porteur épaule contre épaule sur son écran', () => {
  for (const realismProfile of ['legacy', 'realistic'] as const) {
    it.each(CASES)(`%s (${realismProfile}) : le porteur rase le poseur`, (id, carrier, screener) => {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const state: AppState = { ...makeInitialState(), realismProfile,
        steps: structuredClone(t.steps), defenseInitial: structuredClone(t.defenseInitial) };
      let min = Infinity;
      for (let k = 0; k <= (state.steps.length - 1) * 60; k++) {
        const f = resolveTimelineFrame(state, k / 60)!;
        min = Math.min(min, distance(f.off[carrier], f.off[screener]));
      }
      expect(min).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
      expect(min).toBeLessThanOrEqual(PLAYER_MIN_CLEARANCE_PX + 6);
    });
  }
});
