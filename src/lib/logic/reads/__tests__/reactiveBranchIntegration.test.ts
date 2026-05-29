// Tests L.1.1 — intégration : recompileScenarioSteps câble la lecture réactive.
//
// On vérifie que changer la couverture défensive change AUTOMATIQUEMENT la
// suite compilée (sans toucher activeBranchId), et que `resolvedReadBranchId`
// reflète la branche active.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, OffensiveScriptedAction, ScreenRule } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { recompileScenarioSteps } from '@/lib/state/transforms/shared';
import { buildCanonicalReadBranches } from '@/lib/data/readLibrary';

const PNR_ID = 'pnr-1';

const PNR: OffensiveScriptedAction = {
  kind: 'offensive',
  id: PNR_ID,
  type: 'pick-and-roll',
  params: { ballHandler: 'O1', screener: 'O5', side: 'fort' },
};

/** État de base : un step-écran détectable (forcedScreener O5, generatedBy PNR)
 *  + le PnR comme action scriptée + les branches réactives canoniques. */
function makeBaseState(screenRule: ScreenRule): AppState {
  const s0 = makeInitialState();
  const offN1: AttackerPositions = {
    O1: { x: 300, y: 380 },
    O2: { x: 100, y: 380 },
    O3: { x: 500, y: 380 },
    O4: { x: 200, y: 200 },
    O5: { x: 305, y: 350 },
  };
  const offN: AttackerPositions = { ...offN1, O1: { x: 280, y: 350 }, O5: { x: 305, y: 320 } };
  let idN = 0;
  const branches = buildCanonicalReadBranches(PNR, { weakSideId: 'O3' }, () => `b-${idN++}`);
  return {
    ...s0,
    steps: [
      makeStep(offN1, 'O1', []),
      { ...makeStep(offN, 'O1', []), forcedScreener: 'O5', generatedBy: PNR_ID },
    ],
    activeStep: 1,
    screenRule,
    scriptedActions: [PNR],
    scenarioBranches: branches,
  };
}

function branchIdFor(state: AppState, coverage: ScreenRule): string {
  const b = (state.scenarioBranches ?? []).find((x) => x.trigger?.coverage[0] === coverage);
  if (!b) throw new Error(`pas de branche ${coverage}`);
  return b.id;
}

describe('recompileScenarioSteps — lecture réactive', () => {
  it('drop → résout la branche drop et splice sa continuation', () => {
    const base = makeBaseState('drop');
    const out = recompileScenarioSteps(base);
    expect(out.resolvedReadBranchId).toBe(branchIdFor(base, 'drop'));
    // La continuation drop (drive O1) a généré des steps.
    const dropBranch = base.scenarioBranches!.find((b) => b.id === out.resolvedReadBranchId)!;
    const branchActionIds = new Set(dropBranch.actions.map((a) => a.id));
    expect(out.steps.some((s) => s.generatedBy && branchActionIds.has(s.generatedBy))).toBe(true);
  });

  it('blitz → résout la branche blitz (suite différente de drop)', () => {
    const dropOut = recompileScenarioSteps(makeBaseState('drop'));
    const blitzBase = makeBaseState('blitz');
    const blitzOut = recompileScenarioSteps(blitzBase);
    expect(blitzOut.resolvedReadBranchId).toBe(branchIdFor(blitzBase, 'blitz'));
    // Les deux lectures produisent des séquences distinctes.
    expect(blitzOut.steps.length).not.toBe(dropOut.steps.length);
  });

  it('couverture sans branche correspondante → chemin principal, pas de read', () => {
    // 'weak' n'est pas dans la table canonique → aucune branche ne matche.
    const out = recompileScenarioSteps(makeBaseState('weak'));
    expect(out.resolvedReadBranchId).toBeNull();
  });

  it('override manuel prime : activeBranchId force, resolvedReadBranchId reste null', () => {
    const base = makeBaseState('drop');
    const blitzId = branchIdFor(base, 'blitz');
    const out = recompileScenarioSteps({ ...base, activeBranchId: blitzId });
    // Manuel = blitz, bien que la couverture lue soit drop.
    expect(out.resolvedReadBranchId).toBeNull();
    const blitzBranch = base.scenarioBranches!.find((b) => b.id === blitzId)!;
    const blitzActionIds = new Set(blitzBranch.actions.map((a) => a.id));
    expect(out.steps.some((s) => s.generatedBy && blitzActionIds.has(s.generatedBy))).toBe(true);
  });
});
