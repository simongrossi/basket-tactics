import { describe, expect, it } from 'vitest';
import type {
  AppState,
  AttackerPositions,
  DefenderPositions,
} from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';

/** Scénario : O1 démarre en (200, 400) et est annoté pour cut tout droit
 *  vers (400, 400). Un défenseur D2 (NON matché à O1) est planté pile au
 *  milieu de la trajectoire en (300, 400). On vérifie qu'à mi-step, le CVT
 *  offensif dévie O1 latéralement, alors qu'avec flag OFF on prend la même
 *  ligne droite (le matched-defender est D1 dans `makeInitialState`, donc
 *  curveAroundObstacle ne s'active pas sur D2 ici sans configuration extra). */
function makeCutThroughObstacleScenario(overrides: Partial<AppState> = {}): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 200, y: 400 },
    O2: { x: 100, y: 100 },
    O3: { x: 500, y: 100 },
    O4: { x: 100, y: 700 },
    O5: { x: 500, y: 700 },
  };
  const off1: AttackerPositions = {
    O1: { x: 400, y: 400 },
    O2: { x: 100, y: 100 },
    O3: { x: 500, y: 100 },
    O4: { x: 100, y: 700 },
    O5: { x: 500, y: 700 },
  };
  // D2 planté pile sur la ligne droite de O1 (en 300, 400).
  const def0: DefenderPositions = {
    D1: { x: 200, y: 380 },
    D2: { x: 300, y: 400 },
    D3: { x: 500, y: 80 },
    D4: { x: 100, y: 680 },
    D5: { x: 500, y: 680 },
  };
  return {
    ...base,
    steps: [
      {
        off: off0,
        ballCarrier: 'O1',
        annotations: [
          {
            type: 'cut',
            fromId: 'O1',
            from: { x: 200, y: 400 },
            to: { x: 400, y: 400 },
          },
        ],
      },
      { off: off1, ballCarrier: 'O1', annotations: [] },
    ],
    activeStep: 0,
    defenseInitial: def0,
    ...overrides,
  };
}

describe('CVT offensif (cvtOffensiveEnabled)', () => {
  it("dévie l'attaquant latéralement lorsqu'un défenseur est sur sa trajectoire", () => {
    const stateOff = makeCutThroughObstacleScenario({ cvtOffensiveEnabled: false });
    const stateOn = makeCutThroughObstacleScenario({ cvtOffensiveEnabled: true });

    const frameOff = resolveFrameAt(stateOff, 0.5)!;
    const frameOn = resolveFrameAt(stateOn, 0.5)!;

    const deviationOff = Math.abs(frameOff.off.O1.y - 400);
    const deviationOn = Math.abs(frameOn.off.O1.y - 400);

    // CVT offensif produit une déviation latérale strictement plus grande
    // que l'absence d'évitement (ou égale au cas où Bezier opère déjà).
    expect(deviationOn).toBeGreaterThan(deviationOff);
    // La déviation reste bornée : pas de saut visible (max ~8 px / frame).
    expect(deviationOn).toBeLessThan(15);
  });

  it('reste borné : aucun saut > MAX_STEP_PX entre deux frames consécutifs', () => {
    const state = makeCutThroughObstacleScenario({ cvtOffensiveEnabled: true });
    const f1 = resolveFrameAt(state, 0.45)!;
    const f2 = resolveFrameAt(state, 0.55)!;
    const dx = f2.off.O1.x - f1.off.O1.x;
    const dy = f2.off.O1.y - f1.off.O1.y;
    const jump = Math.hypot(dx, dy);
    // Garde-fou anti-snap : sur un Δt court, déplacement modéré.
    expect(jump).toBeLessThan(30);
  });

  it("respecte la règle de clearance (Rule 1) avec le solveur final", () => {
    const state = makeCutThroughObstacleScenario({ cvtOffensiveEnabled: true });
    const frame = resolveFrameAt(state, 0.5)!;

    // Tous les couples attaquant ↔ attaquant doivent respecter 34 px minimum.
    const ids = Object.keys(frame.off) as (keyof typeof frame.off)[];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = frame.off[ids[i]];
        const b = frame.off[ids[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(33);
      }
    }
  });
});
