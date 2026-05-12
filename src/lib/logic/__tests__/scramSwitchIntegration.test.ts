// Tests d'intégration B1 — scram switch dans le pipeline défensif complet.
//
// Vérifie que le scram switch :
//   1. est désactivé par défaut (rétrocompat)
//   2. ne s'active pas en l'absence d'écran porteur ou de rule 'switch'
//   3. se déclenche après un switch porteur qui crée un mismatch ≥ seuil
//   4. propage les flags `scrammedThisStep` et `mismatchSeverity` jusqu'à
//      `ComputedDefender` (consommables par les composants visuels)

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

/** Construit un AppState où un écran O5 → O1 est posé : O5 plaqué sur D1,
 *  rule globale 'switch'. Le matchup post-switch sera D1→O5 et D5→O1. */
function makeSwitchScenarioState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  // Place O5 (pivot) au contact de D1 (qui défend O1, le porteur).
  // initialOff.O1 = {300, 470}, initialDef.D1 = {300, 380}, initialOff.O5 = {380, 230}
  // → on déplace O5 près de D1 pour déclencher la détection d'écran.
  return {
    ...s0,
    steps: [
      {
        ...s0.steps[0],
        off: {
          ...s0.steps[0].off,
          O5: { x: 305, y: 380 }, // collé sur D1
        },
        ballCarrier: 'O1',
        forcedScreener: 'O5', // force la détection sans dépendre des heuristiques
      },
    ],
    screenRule: 'switch',
    ...overrides,
  };
}

describe('Scram switch — intégration', () => {
  it('désactivé par défaut → switch standard, pas de scram', () => {
    const state = makeSwitchScenarioState(); // scramSwitchEnabled non défini = false
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.scrammedThisStep).toBeFalsy();
    expect(def.D5.scrammedThisStep).toBeFalsy();
    // Le switch standard a quand même eu lieu : D5 doit défendre O1
    expect(def.D5.matchedTo).toBe('O1');
    expect(def.D1.matchedTo).toBe('O5');
    // Severities ≥ 4 (mismatch extrême D5 sur O1)
    expect(def.D5.mismatchSeverity).toBe(4);
    expect(def.D1.mismatchSeverity).toBe(4);
  });

  it('activé + seuil 2 → scram déclenché, matchups améliorés', () => {
    const state = makeSwitchScenarioState({
      scramSwitchEnabled: true,
      mismatchThreshold: 2,
    });
    const def = effectiveDefensePositions(state, 0);

    // Au moins UN défenseur tiers doit avoir scrammed (le candidat le plus
    // proche d'O1). D5 doit être délesté (passe sur le matchup de ce tiers).
    const scrammedCount = (['D1', 'D2', 'D3', 'D4', 'D5'] as const).filter(
      (d) => def[d].scrammedThisStep
    ).length;
    expect(scrammedCount).toBe(2); // exactement la paire scram (from + to)

    // D5 ne doit PLUS défendre O1 (l'attaquant exposé) après scram
    expect(def.D5.matchedTo).not.toBe('O1');

    // Et la severity max parmi les défenseurs doit être ≤ celle d'avant scram (4)
    const maxSeverity = Math.max(
      ...(['D1', 'D2', 'D3', 'D4', 'D5'] as const).map((d) => def[d].mismatchSeverity ?? 0)
    );
    expect(maxSeverity).toBeLessThanOrEqual(4);
  });

  it('respecte le seuil : seuil 5 (impossible) → pas de scram même si activé', () => {
    const state = makeSwitchScenarioState({
      scramSwitchEnabled: true,
      mismatchThreshold: 5, // au-dessus de la max severity possible (4)
    });
    const def = effectiveDefensePositions(state, 0);
    expect(def.D1.scrammedThisStep).toBeFalsy();
    expect(def.D5.scrammedThisStep).toBeFalsy();
  });

  it('sans switch (rule "over") → pas de mismatch propagé', () => {
    const state = makeSwitchScenarioState({
      scramSwitchEnabled: true,
      screenRule: 'over',
    });
    const def = effectiveDefensePositions(state, 0);
    // Matchups intacts (D1 sur O1, D5 sur O5)
    expect(def.D1.matchedTo).toBe('O1');
    expect(def.D5.matchedTo).toBe('O5');
    // Severities 0 (naturel) → undefined dans le record (baseTargets skip si 0)
    expect(def.D1.mismatchSeverity ?? 0).toBe(0);
    expect(def.D5.mismatchSeverity ?? 0).toBe(0);
  });

  it("severity propagée même sans scram activé (visu fonctionne)", () => {
    const state = makeSwitchScenarioState(); // pas de scram
    const def = effectiveDefensePositions(state, 0);
    // Les défenseurs en mismatch ont bien leur severity propagée
    expect(def.D5.mismatchSeverity).toBe(4);
    expect(def.D1.mismatchSeverity).toBe(4);
    // Les autres défenseurs (D2/D3/D4) ne sont pas affectés
    expect(def.D2.mismatchSeverity ?? 0).toBe(0);
  });
});
