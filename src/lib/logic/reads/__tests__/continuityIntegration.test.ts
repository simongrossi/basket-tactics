import { describe, it, expect } from 'vitest';
import type { AppState, ContinuityLoop, OffensiveScriptedAction } from '@/lib/types';
import { compileScenario } from '@/lib/logic/compileScenario';
import { makeInitialState } from '@/lib/data/initial';

/** Deux passes en boucle : O1→O2 puis O2→O3, rotation O1→O2→O3→O4→O5.
 *  genPass lit params.from / params.to (tous deux remappés par la rotation). */
function passAction(id: string, from: 'O1' | 'O2', to: 'O2' | 'O3'): OffensiveScriptedAction {
  return { kind: 'offensive', id, type: 'pass', params: { from, to } };
}

describe('continuity — intégration compileScenario', () => {
  const s0: AppState = makeInitialState();
  const actions = [passAction('b1', 'O1', 'O2'), passAction('b2', 'O2', 'O3')];
  const loop: ContinuityLoop = {
    startActionId: 'b1', endActionId: 'b2',
    rotation: ['O1', 'O2', 'O3', 'O4', 'O5'], maxCycles: 2,
  };

  it('sans boucle → steps identiques (rétrocompat)', () => {
    const base = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
    });
    const withUndef = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
      continuityLoop: undefined,
    });
    expect(withUndef.length).toBe(base.length);
  });

  it('avec boucle 2 cycles → plus de steps que le chemin simple', () => {
    const base = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
    });
    const looped = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
      continuityLoop: loop,
    });
    expect(looped.length).toBeGreaterThan(base.length);
  });

  it('le cycle 1 porte des generatedBy namespacés (#c1)', () => {
    const looped = compileScenario({
      initialOff: s0.steps[0].off, initialBallCarrier: 'O1', actions, playerCount: 5,
      continuityLoop: loop,
    });
    const c1Steps = looped.filter((st) => st.generatedBy?.includes('#c1'));
    expect(c1Steps.length).toBeGreaterThan(0);
  });
});
