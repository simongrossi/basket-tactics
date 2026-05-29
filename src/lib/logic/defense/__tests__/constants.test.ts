// DM.1 — verrou des constantes défensives centralisées.
//
// Garde-fou anti-régression : l'audit avait signalé une "incohérence" entre
// deux HELP_BUSY_THRESHOLD (0.5 vs 0.3). Ce n'est PAS un bug — ce sont deux
// seuils volontairement distincts (un dig est un engagement moindre qu'un
// bump). Ce test documente et protège cet écart : si quelqu'un les unifie par
// erreur, le test casse et rappelle l'intention.

import { describe, expect, it } from 'vitest';
import {
  POST_HELP_BUSY_THRESHOLD,
  CUTTER_BUMP_HELP_BUSY_THRESHOLD,
  INTERPOSE_MAX_SHIFT_PX,
  SCREEN_REPEL_LAYER_MAX_SHIFT_PX,
} from '../constants';

describe('constantes défensives centralisées (DM.1)', () => {
  it('les deux seuils help-busy sont volontairement distincts', () => {
    expect(POST_HELP_BUSY_THRESHOLD).toBe(0.5);
    expect(CUTTER_BUMP_HELP_BUSY_THRESHOLD).toBe(0.3);
    // Un dig (post) tolère plus d'engagement qu'un bump (cutter).
    expect(POST_HELP_BUSY_THRESHOLD).toBeGreaterThan(CUTTER_BUMP_HELP_BUSY_THRESHOLD);
  });

  it('les caps de shift restent conservateurs (valeurs historiques)', () => {
    expect(INTERPOSE_MAX_SHIFT_PX).toBe(5);
    expect(SCREEN_REPEL_LAYER_MAX_SHIFT_PX).toBe(3);
  });
});
