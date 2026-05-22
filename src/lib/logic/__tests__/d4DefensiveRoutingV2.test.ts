// D.4 V2 — Routage des cibles de step dans `computeEffectiveDefensePositions`.
// Vérifie que, flag activé, un défenseur éligible dont le trajet direct
// croise un obstacle non-écran (a) voit sa cible de step déviée vs flag
// désactivé, et (b) ne casse jamais l'invariant de clearance (Règle 1).

import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { getActiveDefenderIds } from '@/lib/logic/players';

/**
 * Construit un état 2 steps en défense individuelle où un défenseur
 * éligible doit, au step 1, traverser une zone occupée par un autre
 * joueur — ce qui force le routage V2 quand le flag est actif.
 *
 * Géométrie : on déplace O3 (marqué par D3) vers le coin haut-gauche au
 * step 1. D3 part de bas-droite (~430,310) et doit rejoindre une cible
 * en haut-gauche. On fige D5 (override) pile au milieu de ce trajet :
 * D5 devient un obstacle non-écran sur la ligne droite de D3. D3 n'est
 * ni sur écran, ni en PnR, ni en closeout (le porteur O1 ne change pas) :
 * il est donc éligible au routage V2.
 */
function v2RoutingState(): AppState {
  const base = makeInitialState();
  const step0 = base.steps[0];
  // D5 figé pile au milieu du trajet droit de D3 (obstacle non-écran).
  const obstacle = { D5: { x: 300, y: 250 } } as const;
  const step0WithObstacle = {
    ...step0,
    defenseOverrides: { ...obstacle },
  };
  const step1 = {
    ...step0,
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 150, y: 150 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1' as const,
    annotations: [],
    defenseOverrides: { ...obstacle },
  };
  return {
    ...base,
    defenseSystem: 'man',
    steps: [step0WithObstacle, step1],
  };
}

describe('D.4 V2 — routage des cibles de step', () => {
  it('flag activé → au moins une cible de défenseur dévie vs flag désactivé', () => {
    const state = v2RoutingState();
    const off = effectiveDefensePositions({ ...state, defensiveRouting: false }, 1);
    const on = effectiveDefensePositions({ ...state, defensiveRouting: true }, 1);
    const ids = getActiveDefenderIds(state.playerCount);
    const maxDelta = Math.max(
      ...ids.map((id) => Math.hypot(on[id].x - off[id].x, on[id].y - off[id].y)),
    );
    expect(maxDelta).toBeGreaterThan(2);
  });

  it('flag activé → invariant de clearance préservé entre tous les joueurs', () => {
    const state = { ...v2RoutingState(), defensiveRouting: true };
    const def = effectiveDefensePositions(state, 1);
    const ids = getActiveDefenderIds(state.playerCount);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = def[ids[i]];
        const b = def[ids[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 1);
      }
    }
  });
});
