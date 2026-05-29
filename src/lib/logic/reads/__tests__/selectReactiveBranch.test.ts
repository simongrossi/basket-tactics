// Tests L.0.4 — sélection de branche réactive.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, ScenarioBranch, ScreenRule } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { selectReactiveBranch } from '../selectReactiveBranch';

const PNR_ACTION_ID = 'act-pnr';

/** PnR compilé : le step 1 porte `generatedBy: PNR_ACTION_ID` et un écran O5. */
function makeScenarioState(
  screenRule: ScreenRule,
  branches: ScenarioBranch[],
  overrides: Partial<AppState> = {}
): AppState {
  const s0 = makeInitialState();
  const offN1: AttackerPositions = {
    O1: { x: 300, y: 380 },
    O2: { x: 100, y: 380 },
    O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 },
    O5: { x: 305, y: 350 },
  };
  const offN: AttackerPositions = { ...offN1, O1: { x: 280, y: 350 }, O5: { x: 305, y: 320 } };
  return {
    ...s0,
    steps: [
      makeStep(offN1, 'O1', []),
      { ...makeStep(offN, 'O1', []), forcedScreener: 'O5', generatedBy: PNR_ACTION_ID },
    ],
    activeStep: 1,
    screenRule,
    scenarioBranches: branches,
    ...overrides,
  };
}

function reactiveBranch(id: string, coverage: ScreenRule[]): ScenarioBranch {
  return {
    id,
    label: `${coverage.join('/')} read`,
    divergeAfterActionId: PNR_ACTION_ID,
    actions: [],
    trigger: { kind: 'screen-coverage', actionId: PNR_ACTION_ID, coverage },
  };
}

describe('selectReactiveBranch', () => {
  it('active la branche dont la couverture matche la défense jouée (drop)', () => {
    const state = makeScenarioState('drop', [
      reactiveBranch('b-drop', ['drop']),
      reactiveBranch('b-blitz', ['blitz']),
    ]);
    expect(selectReactiveBranch(state).branch?.id).toBe('b-drop');
  });

  it('bascule de branche quand la couverture change (blitz)', () => {
    const state = makeScenarioState('blitz', [
      reactiveBranch('b-drop', ['drop']),
      reactiveBranch('b-blitz', ['blitz']),
    ]);
    expect(selectReactiveBranch(state).branch?.id).toBe('b-blitz');
  });

  it('null si aucune branche ne matche la couverture', () => {
    const state = makeScenarioState('switch', [reactiveBranch('b-drop', ['drop'])]);
    expect(selectReactiveBranch(state).branch).toBeNull();
  });

  it('le choix manuel (activeBranchId) prime sur la résolution réactive', () => {
    const manual: ScenarioBranch = {
      id: 'b-manual',
      label: 'Manuel',
      divergeAfterActionId: PNR_ACTION_ID,
      actions: [],
      // pas de trigger → branche manuelle V1
    };
    const state = makeScenarioState('drop', [manual, reactiveBranch('b-drop', ['drop'])], {
      activeBranchId: 'b-manual',
    });
    // Bien que b-drop matcherait, le manuel gagne.
    expect(selectReactiveBranch(state).branch?.id).toBe('b-manual');
  });

  it('premier match gagne en cas de couvertures qui se recouvrent', () => {
    const state = makeScenarioState('drop', [
      reactiveBranch('b-first', ['drop', 'ice']),
      reactiveBranch('b-second', ['drop']),
    ]);
    expect(selectReactiveBranch(state).branch?.id).toBe('b-first');
  });

  it('ignore une branche réactive dont l\'action source n\'a généré aucun step', () => {
    const state = makeScenarioState('drop', [
      { ...reactiveBranch('b-orphan', ['drop']), trigger: { kind: 'screen-coverage', actionId: 'act-absent', coverage: ['drop'] } },
    ]);
    expect(selectReactiveBranch(state).branch).toBeNull();
  });

  it('null sans branches', () => {
    const state = makeScenarioState('drop', []);
    expect(selectReactiveBranch(state).branch).toBeNull();
  });
});
