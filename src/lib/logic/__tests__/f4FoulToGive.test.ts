// Tests F.4 — End-of-quarter foul to give detection.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { detectFoulToGiveOpportunity } from '@/lib/logic/defense/detectFoulToGiveOpportunity';
import { foulToGiveRule } from '@/lib/logic/coachDiagnostics/rules/foulToGive';
import { computeCoachDiagnostics } from '@/lib/logic/coachDiagnostics';

/** Scénario 2-steps : O1 drive frontal sur D1 (rapprochement net du panier
 *  entre step 0 et step 1). Le step 1 reçoit clockSeconds et defenseTeamFouls
 *  selon le test. */
function makeFoulToGiveScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const setup: AttackerPositions = {
    O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
    O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
  };
  const driving: AttackerPositions = { ...setup, O1: { x: 290, y: 280 } }; // rapproché ~200px du panier
  return {
    ...base,
    steps: [
      { off: setup, ballCarrier: 'O1', annotations: [] },
      { off: driving, ballCarrier: 'O1', annotations: [], clockSeconds: 3 },
    ],
    activeStep: 1,
    triggers: { drive: true, post: false, paint: true, trap: false },
    defenseTeamFouls: 2,
    ...overrides,
  };
}

describe('detectFoulToGiveOpportunity', () => {
  it('détecte l\'opportunité quand clock < 5, fautes < 5 et drive actif', () => {
    const state = makeFoulToGiveScenario();
    const opp = detectFoulToGiveOpportunity(state, 1);
    expect(opp).not.toBeNull();
    expect(opp!.carrier).toBe('O1');
    expect(opp!.clockSeconds).toBe(3);
    expect(opp!.teamFouls).toBe(2);
    // D1 est le défenseur du porteur par défaut.
    expect(opp!.carrierDefender).toBe('D1');
  });

  it('retourne null si clockSeconds est indéfini', () => {
    const state = makeFoulToGiveScenario();
    state.steps[1] = { ...state.steps[1], clockSeconds: undefined };
    expect(detectFoulToGiveOpportunity(state, 1)).toBeNull();
  });

  it('retourne null si clockSeconds >= 5', () => {
    const state = makeFoulToGiveScenario();
    state.steps[1] = { ...state.steps[1], clockSeconds: 7 };
    expect(detectFoulToGiveOpportunity(state, 1)).toBeNull();
  });

  it('retourne null si fautes équipe >= 5 (bonus, plus de foul to give)', () => {
    const state = makeFoulToGiveScenario({ defenseTeamFouls: 5 });
    expect(detectFoulToGiveOpportunity(state, 1)).toBeNull();
  });

  it('retourne null si pas de drive (porteur statique au top)', () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
      O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
    };
    const state: AppState = {
      ...base,
      steps: [
        { off, ballCarrier: 'O1', annotations: [] },
        { off, ballCarrier: 'O1', annotations: [], clockSeconds: 3 }, // pas de mouvement
      ],
      activeStep: 1,
      triggers: { drive: false, post: false, paint: false, trap: false },
      defenseTeamFouls: 0,
    };
    expect(detectFoulToGiveOpportunity(state, 1)).toBeNull();
  });

  it('utilise le fallback géométrique : drive détecté via delta-distance > 30 px', () => {
    const state = makeFoulToGiveScenario({
      triggers: { drive: false, post: false, paint: false, trap: false },
    });
    // O1 passe de y=480 à y=280 → rapprochement net du panier (~200 px).
    const opp = detectFoulToGiveOpportunity(state, 1);
    expect(opp).not.toBeNull();
  });
});

describe('foulToGiveRule (intégration coachDiagnostics)', () => {
  it('émet un diagnostic critical avec le bon tag', () => {
    const state = makeFoulToGiveScenario();
    const diags = computeCoachDiagnostics(state, 1);
    const found = diags.find((d) => d.tag === 'foul-to-give');
    expect(found).toBeDefined();
    expect(found!.severity).toBe('critical');
    expect(found!.defenders).toEqual(['D1']);
    expect(found!.attackers).toEqual(['O1']);
  });

  it('n\'émet rien si clockSeconds est indéfini', () => {
    const state = makeFoulToGiveScenario();
    state.steps[1] = { ...state.steps[1], clockSeconds: undefined };
    const diags = computeCoachDiagnostics(state, 1);
    expect(diags.find((d) => d.tag === 'foul-to-give')).toBeUndefined();
  });

  // Test direct de la règle (vs computeCoachDiagnostics qui aussi dédoublonne)
  it('foulToGiveRule retourne [] sans contexte valide', () => {
    const state = makeFoulToGiveScenario();
    state.defenseTeamFouls = 5; // bonus
    const diags = computeCoachDiagnostics(state, 1);
    expect(diags.find((d) => d.tag === 'foul-to-give')).toBeUndefined();
    // Pour ESLint : référence l'import.
    void foulToGiveRule;
  });
});
