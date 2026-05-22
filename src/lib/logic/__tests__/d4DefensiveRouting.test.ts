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

  // Garde-fou anti-régression : les 3 tests ci-dessus (clearance, déterminisme,
  // no-throw) resteraient VERTS même si le bloc de routage était mort (jamais
  // déclenché) — ils valideraient juste le lerp droit. Ce test prouve que le
  // routage modifie RÉELLEMENT une trajectoire : on plante un obstacle pile
  // sur la ligne droite d'un défenseur, et on vérifie que flag on ≠ flag off.
  it('détourne réellement un défenseur quand un joueur barre sa ligne droite', () => {
    const base = makeInitialState();
    const step0 = base.steps[0];
    // O1 (porteur, marqué par D1) traverse vers l'aile gauche : D1 doit
    // suivre, son segment defA→defB va donc de bas-droite vers haut-gauche.
    const step1 = {
      ...step0,
      off: {
        O1: { x: 120, y: 250 },
        O2: { x: 130, y: 380 },
        O3: { x: 470, y: 380 },
        O4: { x: 220, y: 230 },
        O5: { x: 380, y: 230 },
      },
      ballCarrier: 'O1' as const,
      annotations: [],
      // D2 est figé (override) pile au milieu de la ligne droite de D1.
      // Override → D2 n'est pas lui-même routé, mais reste un obstacle.
      defenseOverrides: { D2: { x: 222, y: 331 } },
    };
    const step0WithObstacle = {
      ...step0,
      defenseOverrides: { D2: { x: 222, y: 331 } },
    };
    const base2: AppState = { ...base, steps: [step0WithObstacle, step1] };

    const off = resolveFrameAt({ ...base2, defensiveRouting: false }, 0.5);
    const on = resolveFrameAt({ ...base2, defensiveRouting: true }, 0.5);
    expect(off).not.toBeNull();
    expect(on).not.toBeNull();

    // Au moins un défenseur dévie de façon significative (> 2 px) à mi-segment.
    let maxDiff = 0;
    for (const id of Object.keys(off!.defPos) as (keyof NonNullable<typeof off>['defPos'])[]) {
      const o = off!.defPos[id];
      const n = on!.defPos[id];
      maxDiff = Math.max(maxDiff, Math.hypot(n.x - o.x, n.y - o.y));
    }
    expect(maxDiff).toBeGreaterThan(2);

    // Les snapshots aux step exacts restent identiques (le routage ne touche
    // que la position INTERPOLÉE — cf. docs/d4-pathfinding-plan.md).
    const endA = resolveFrameAt({ ...base2, defensiveRouting: true }, 0);
    const endAoff = resolveFrameAt({ ...base2, defensiveRouting: false }, 0);
    const endB = resolveFrameAt({ ...base2, defensiveRouting: true }, 1);
    const endBoff = resolveFrameAt({ ...base2, defensiveRouting: false }, 1);
    expect(endA?.defPos).toEqual(endAoff?.defPos);
    expect(endB?.defPos).toEqual(endBoff?.defPos);
  });
});
