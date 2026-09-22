import { describe, expect, it } from 'vitest';
import { makeAppInitialState } from '../initial';
import { applySavedSystem, snapshotFromAppState } from '../library';

describe('contexte autonome des systèmes', () => {
  it('restitue un 3c3 avec son effectif, son terrain et sa physique après un autre système', () => {
    const original = { ...makeAppInitialState(), playerCount: 3 as const, fullCourt: true,
      attackingDirection: 'down' as const, secondsPerStep: 1.5,
      playerNames: { O1: 'Camille' }, playerNumbers: { O1: '7' },
      defenderAcceleration: 4, defensiveRouting: true, showDefenders: false };
    const saved = JSON.parse(JSON.stringify(snapshotFromAppState(original, 'Transition 3c3')));
    const current = { ...makeAppInitialState(), footworkRulesEnabled: false, physicsReboundsEnabled: true };
    const loaded = applySavedSystem(current, saved);
    expect(loaded).toMatchObject(original);
    expect(loaded.physicsReboundsEnabled).toBe(false);
    expect(loaded.footworkRulesEnabled).toBeUndefined();
    loaded.playerNames!.O1 = 'Modifié';
    expect(saved.settings.playerNames.O1).toBe('Camille');
  });

  it('charge un ancien système avec des valeurs déterministes, pas celles du précédent', () => {
    const saved = snapshotFromAppState(makeAppInitialState(), 'Ancien');
    delete saved.settings;
    const previous = { ...makeAppInitialState(), playerCount: 3 as const, fullCourt: true, secondsPerStep: 9 };
    const loaded = applySavedSystem(previous, saved);
    expect(loaded.playerCount).toBe(5);
    expect(loaded.fullCourt).toBe(false);
    expect(loaded.secondsPerStep).toBeUndefined();
  });
});
