import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import type { AppState } from '@/lib/types';
import { collectPlaybackGoldenMetrics } from '../playbackGoldenMetrics';

const GOLDEN_IDS = [
  'screen-lab-pnr',
  'screen-lab-pindown',
  'screen-lab-offball',
  'screen-lab-chain-stagger',
  'pnr-central',
  'ucla-cut',
] as const;

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  return {
    ...makeInitialState(),
    steps: structuredClone(tpl.steps),
    defenseInitial: structuredClone(tpl.defenseInitial),
    activeStep: 0,
  };
}

describe('playback golden metrics', () => {
  GOLDEN_IDS.forEach((tplId) => {
    it(`${tplId} respecte les seuils golden`, () => {
      const metrics = collectPlaybackGoldenMetrics(buildState(tplId), { fps: 30 });

      expect(metrics.frames).toBeGreaterThan(0);
      expect(metrics.maxAttackerJumpPx).toBeLessThanOrEqual(20);
      expect(metrics.maxDefenderJumpPx).toBeLessThanOrEqual(20);
      expect(metrics.minPlayerClearancePx).toBeGreaterThanOrEqual(20);
      expect(metrics.screenContactFrames).toBeGreaterThan(0);
      expect(metrics.averageResolveMs).toBeLessThan(8);
    });
  });
});
