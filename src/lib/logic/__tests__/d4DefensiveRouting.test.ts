// D.4 — Test d'intégration du routage défensif dans le playback.
// Vérifie que, flag activé, le routage (a) ne casse JAMAIS l'invariant
// de clearance (Règle 1 / PLAYER-CLEARANCE.md), et (b) reste déterministe.
// La validation de l'AMÉLIORATION visuelle (moins de bruit) passe par les
// golden metrics J.6 régénérées flag on, hors de ce test automatique.

import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

/** État à >= 2 steps : on duplique le step 0 pour garantir une transition
 *  jouable, puis on active le routage. */
function routingState(): AppState {
  const s = makeInitialState();
  const steps = s.steps.length >= 2 ? s.steps : [s.steps[0], { ...s.steps[0], annotations: [] }];
  return { ...s, steps, defensiveRouting: true };
}

/** Min de clearance observé sur toute la lecture, échantillon dense. */
function minClearance(state: AppState, framesPerTransition = 40): number {
  let min = Infinity;
  const transitions = state.steps.length - 1;
  for (let trans = 0; trans < transitions; trans++) {
    for (let k = 0; k <= framesPerTransition; k++) {
      const frame = resolveFrameAt(state, trans + k / framesPerTransition);
      if (!frame) continue;
      const pts = [
        ...Object.values(frame.off),
        ...Object.values(frame.defPos).map((d) => ({ x: d.x, y: d.y })),
      ];
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < min) min = d;
        }
      }
    }
  }
  return min;
}

describe('D.4 — routage défensif (intégration playback)', () => {
  it('préserve l\'invariant de clearance flag activé', () => {
    const state = routingState();
    // tolérance 1 px : resolvePlayerCollisions garantit la clearance dure.
    expect(minClearance(state)).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 1);
  });

  it('est déterministe : 2 résolutions de la même frame sont identiques', () => {
    const state = routingState();
    const a = resolveFrameAt(state, 0.5);
    const b = resolveFrameAt(state, 0.5);
    expect(a?.defPos).toEqual(b?.defPos);
  });

  it('ne lève aucune exception sur toute la lecture flag activé', () => {
    const state = routingState();
    expect(() => minClearance(state)).not.toThrow();
  });
});
