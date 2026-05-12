// Tests #5 — defense presets utilisateur (snapshot + apply + CRUD).

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import {
  snapshotDefensePreset,
  applyUserDefensePreset,
  addDefensePreset,
  deleteDefensePreset,
  renameDefensePreset,
  type UserLibrary,
} from '@/lib/data/library';

function emptyLib(): UserLibrary {
  return { version: 1, folders: [{ id: 'f1', name: 'F', systems: [], createdAt: 0 }] };
}

describe('snapshotDefensePreset', () => {
  it("capture les champs défensifs courants", () => {
    const state = makeInitialState();
    const preset = snapshotDefensePreset(state, 'Mon preset', 'Description test');
    expect(preset.name).toBe('Mon preset');
    expect(preset.description).toBe('Description test');
    expect(preset.id).toMatch(/^preset-/);
    expect(preset.createdAt).toBeGreaterThan(0);
    expect(preset.defenseSystem).toBe(state.defenseSystem);
    expect(preset.screenRule).toBe(state.screenRule);
    expect(preset.rules).toEqual(state.rules);
    expect(preset.triggers).toEqual(state.triggers);
  });

  it("inclut les nouveaux champs B1-B10 quand définis", () => {
    const state = {
      ...makeInitialState(),
      scramSwitchEnabled: true,
      hedgeAggression: 80,
      switchPolicy: '1-3' as const,
      autoBumpCutters: true,
      postCoverage: 'dig' as const,
    };
    const preset = snapshotDefensePreset(state, 'Avec B1-B10');
    expect(preset.scramSwitchEnabled).toBe(true);
    expect(preset.hedgeAggression).toBe(80);
    expect(preset.switchPolicy).toBe('1-3');
    expect(preset.autoBumpCutters).toBe(true);
    expect(preset.postCoverage).toBe('dig');
  });

  it("clone profondément les rules (mutation snapshot ≠ mutation state)", () => {
    const state = makeInitialState();
    const preset = snapshotDefensePreset(state, 'X');
    preset.rules.D1.helpPct = 99;
    expect(state.rules.D1.helpPct).not.toBe(99);
  });
});

describe('applyUserDefensePreset', () => {
  it("override les champs défensifs sans toucher aux steps", () => {
    const state = makeInitialState();
    const preset = snapshotDefensePreset(state, 'X');
    preset.defenseDistance = 99;
    preset.screenRule = 'ice';
    preset.hedgeAggression = 75;
    const next = applyUserDefensePreset(state, preset);
    expect(next.defenseDistance).toBe(99);
    expect(next.screenRule).toBe('ice');
    expect(next.hedgeAggression).toBe(75);
    // Les steps et le reste sont inchangés
    expect(next.steps).toBe(state.steps);
    expect(next.activeStep).toBe(state.activeStep);
  });

  it("préserve closeoutBoost si le preset ne le redéfinit pas", () => {
    const state = { ...makeInitialState(), closeoutBoost: 1.6 };
    const preset = snapshotDefensePreset(makeInitialState(), 'X');
    delete (preset as { closeoutBoost?: number }).closeoutBoost;
    const next = applyUserDefensePreset(state, preset);
    expect(next.closeoutBoost).toBe(1.6);
  });
});

describe('addDefensePreset / deleteDefensePreset / renameDefensePreset', () => {
  it("ajoute un preset à une lib vide", () => {
    const lib = emptyLib();
    const preset = snapshotDefensePreset(makeInitialState(), 'X');
    const next = addDefensePreset(lib, preset);
    expect(next.defensePresets).toHaveLength(1);
    expect(next.defensePresets![0].name).toBe('X');
  });

  it("ajoute en conservant les presets existants", () => {
    const initial = emptyLib();
    const p1 = snapshotDefensePreset(makeInitialState(), 'A');
    const p2 = snapshotDefensePreset(makeInitialState(), 'B');
    const after1 = addDefensePreset(initial, p1);
    const after2 = addDefensePreset(after1, p2);
    expect(after2.defensePresets!.map((p) => p.name)).toEqual(['A', 'B']);
  });

  it("supprime un preset par id", () => {
    const initial = emptyLib();
    const p1 = snapshotDefensePreset(makeInitialState(), 'A');
    const p2 = snapshotDefensePreset(makeInitialState(), 'B');
    const lib = addDefensePreset(addDefensePreset(initial, p1), p2);
    const after = deleteDefensePreset(lib, p1.id);
    expect(after.defensePresets).toHaveLength(1);
    expect(after.defensePresets![0].name).toBe('B');
  });

  it("renomme un preset par id", () => {
    const initial = emptyLib();
    const p1 = snapshotDefensePreset(makeInitialState(), 'Old');
    const lib = addDefensePreset(initial, p1);
    const renamed = renameDefensePreset(lib, p1.id, 'New');
    expect(renamed.defensePresets![0].name).toBe('New');
    // L'id et le createdAt sont préservés
    expect(renamed.defensePresets![0].id).toBe(p1.id);
    expect(renamed.defensePresets![0].createdAt).toBe(p1.createdAt);
  });

  it("no-op si id inconnu", () => {
    const initial = emptyLib();
    const after = deleteDefensePreset(initial, 'unknown-id');
    expect(after.defensePresets).toEqual([]);
  });
});
