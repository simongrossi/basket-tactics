import { describe, expect, it } from 'vitest';
import { makeInitialState } from '../initial';
import { advancedPlacementPatch, isAdvancedPlacementOn } from '../defensePresets';

describe('placement défensif avancé', () => {
  it('désactivé par défaut', () => {
    expect(isAdvancedPlacementOn(makeInitialState())).toBe(false);
  });
  it('un seul interrupteur active et coupe les 4 comportements', () => {
    const on = { ...makeInitialState(), ...advancedPlacementPatch(true) };
    expect(on.helpSideStanceEnabled && on.weakSideShrinkEnabled && on.jumpPassingLanesEnabled && on.denyReversalEnabled).toBe(true);
    expect(isAdvancedPlacementOn(on)).toBe(true);
    const off = { ...on, ...advancedPlacementPatch(false) };
    expect(isAdvancedPlacementOn(off)).toBe(false);
    expect(off.jumpPassingLanesEnabled).toBe(false);
  });
  it('partiellement actif → affiché comme non actif', () => {
    expect(isAdvancedPlacementOn({ ...makeInitialState(), helpSideStanceEnabled: true })).toBe(false);
  });
});
