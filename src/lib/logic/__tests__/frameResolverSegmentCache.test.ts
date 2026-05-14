import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { TEMPLATES } from '@/lib/data/templates';
import type { AppState } from '@/lib/types';
import { resolveFrameAt } from '../playback/frameResolver';

const TEMPLATE_IDS = [
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

describe('resolveFrameAt — cache segmentaire', () => {
  it('donne les mêmes frames avec ou sans cache sur les scénarios écran clés', () => {
    TEMPLATE_IDS.forEach((tplId) => {
      const state = buildState(tplId);
      const maxT = state.steps.length - 1;
      for (let t = 0; t <= maxT; t += 0.25) {
        const uncached = resolveFrameAt(state, t, {
          collectDecisions: true,
          disableSegmentCache: true,
        });
        const cached = resolveFrameAt(state, t, {
          collectDecisions: true,
        });

        expect(cached, `${tplId} t=${t.toFixed(2)}`).toEqual(uncached);
      }
    });
  });

  it('invalide le cache quand un endpoint du segment change sans changer l’objet state', () => {
    const state = buildState('screen-lab-pnr');
    expect(resolveFrameAt(state, 0.5)).not.toBeNull();

    state.steps[1] = {
      ...state.steps[1],
      forcedScreener: 'O5',
      annotations: state.steps[1].annotations.map((ann) =>
        ann.type === 'screen' ? { ...ann, quality: 100 } : ann
      ),
    };

    const uncached = resolveFrameAt(state, 0.5, {
      collectDecisions: true,
      disableSegmentCache: true,
    });
    const cached = resolveFrameAt(state, 0.5, {
      collectDecisions: true,
    });

    expect(cached).toEqual(uncached);
  });
});
