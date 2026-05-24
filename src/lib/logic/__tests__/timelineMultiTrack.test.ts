// Tests "Timeline multi-pistes désynchronisée" (ROADMAP § 5.1).
// Cible : la matrice combinée "2+ acteurs avec timings asynchrones DONT
// au moins une annotation déborde sur le step suivant". Couvre la zone
// où b4AnnotationTiming (intra-step async) et playbackTrajectory
// (cross-step pour 1 actor) ne se recouvrent pas.
//
// Scénario canonique : sur step 0 (durée 2 s) :
//   - O1 : dribble [0, 2.5s]   → DÉPASSE le step, finit dans le step 1
//   - O5 : cut    [0.4s, 1.4s] → asynchrone intra-step (démarre à 20%)
//   - O3 : screen [0, 0.8s]    → courte action intra-step
// On vérifie à plusieurs `localT` que chaque acteur est à la position
// attendue par son timing propre, indépendamment des autres.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { attackerTrajectoryAt } from '@/lib/logic/playbackTrajectory';
import { getStepDurationSeconds } from '@/lib/logic/timecode';

function makeScenario(): AppState {
  const base = makeInitialState();
  const off0: AttackerPositions = {
    O1: { x: 300, y: 460 },
    O2: { x: 130, y: 380 },
    O3: { x: 200, y: 400 },
    O4: { x: 220, y: 230 },
    O5: { x: 400, y: 400 },
  };
  const off1: AttackerPositions = {
    O1: { x: 300, y: 200 },
    O2: { x: 130, y: 380 },
    O3: { x: 280, y: 380 },
    O4: { x: 220, y: 230 },
    O5: { x: 250, y: 280 },
  };
  return {
    ...base,
    steps: [
      {
        off: off0,
        ballCarrier: 'O1',
        duration: 2,
        annotations: [
          // O1 dribble qui DÉPASSE le step (1.5s sur step de 2s = OK).
          // Pour vraiment dépasser : tEndAbs = 2.5s → fraction 1.25.
          {
            type: 'dribble',
            fromId: 'O1',
            from: off0.O1,
            to: off1.O1,
            tStartAbs: 0,
            tEndAbs: 2.5,
          },
          // O5 cut asynchrone intra-step.
          {
            type: 'cut',
            fromId: 'O5',
            from: off0.O5,
            to: off1.O5,
            tStartAbs: 0.4,
            tEndAbs: 1.4,
          },
          // O3 screen court (laisse les autres tranquilles).
          {
            type: 'screen',
            fromId: 'O3',
            from: off0.O3,
            to: off1.O3,
            tStartAbs: 0,
            tEndAbs: 0.8,
          },
        ],
      },
      { off: off1, ballCarrier: 'O1', duration: 2, annotations: [] },
    ],
    activeStep: 0,
  };
}

describe('Timeline multi-pistes désynchronisée (ROADMAP 5.1)', () => {
  it("à localT=0.5 sur step 0 : O5 (cut [0.4s,1.4s]) est mid-cut, O1 (dribble [0,2.5s]) est ~40% avancé, O3 (screen [0,0.8s]) est déjà arrivé", () => {
    const state = makeScenario();
    const getDur = (idx: number) => getStepDurationSeconds(state, idx);
    // localT=0.5 → globalT=0.5 (= 1.0s sur un step de 2s).
    const localT = 0.5;

    const trajO5 = attackerTrajectoryAt(state.steps, 0, 'O5', localT, getDur);
    const startO5 = state.steps[0].off.O5;
    const endO5 = state.steps[1].off.O5;
    // O5 : actionT = (1.0 - 0.4) / (1.4 - 0.4) = 0.6 → 60% du chemin.
    const expO5x = startO5.x + (endO5.x - startO5.x) * 0.6;
    expect(trajO5.position.x).toBeCloseTo(expO5x, 0);

    const trajO1 = attackerTrajectoryAt(state.steps, 0, 'O1', localT, getDur);
    const startO1 = state.steps[0].off.O1;
    const endO1 = state.steps[1].off.O1;
    // O1 : actionT = (1.0 - 0) / (2.5 - 0) = 0.4 → 40% du chemin.
    // Le dribble étant non-linéaire à cause des waypoints/profile, on relâche
    // la tolérance : on vérifie juste que O1 est entre 20% et 60% de son trajet.
    const totalDist = Math.hypot(endO1.x - startO1.x, endO1.y - startO1.y);
    const distFromStart = Math.hypot(trajO1.position.x - startO1.x, trajO1.position.y - startO1.y);
    const progress = distFromStart / totalDist;
    expect(progress).toBeGreaterThan(0.2);
    expect(progress).toBeLessThan(0.6);

    const trajO3 = attackerTrajectoryAt(state.steps, 0, 'O3', localT, getDur);
    const endO3 = state.steps[1].off.O3;
    // O3 screen [0, 0.8s] est fini à localT=0.5 (1.0s > 0.8s) → snap à end.
    expect(trajO3.position.x).toBeCloseTo(endO3.x, 0);
    expect(trajO3.position.y).toBeCloseTo(endO3.y, 0);
  });

  it("le dribble cross-step de O1 continue dans la transition 1→2 (déborde sur le step 1)", () => {
    const state = makeScenario();
    const getDur = (idx: number) => getStepDurationSeconds(state, idx);
    // À localT=0 sur stepIdx=1, globalT = 1.0. L'annotation de O1 a
    // absStart=0, absEnd=2.5/2=1.25 → globalT=1.0 ∈ [0, 1.25]. Encore active.
    // actionT = (1.0 - 0) / 1.25 = 0.8 → 80% du chemin.
    const traj = attackerTrajectoryAt(state.steps, 1, 'O1', 0, getDur);
    const startO1 = state.steps[0].off.O1;
    const endO1 = state.steps[1].off.O1;
    const totalDist = Math.hypot(endO1.x - startO1.x, endO1.y - startO1.y);
    const distFromStart = Math.hypot(traj.position.x - startO1.x, traj.position.y - startO1.y);
    const progress = distFromStart / totalDist;
    // À actionT≈0.8 du dribble, on est entre 60% et 100% du chemin
    // (relâché pour absorber le velocity profile non-linéaire).
    expect(progress).toBeGreaterThan(0.6);
    expect(progress).toBeLessThan(1.05);
  });

  it("chaque acteur est indépendant : changer le timing de O5 n'affecte pas O1 et O3", () => {
    const state = makeScenario();
    const getDur = (idx: number) => getStepDurationSeconds(state, idx);
    const trajO1Before = attackerTrajectoryAt(state.steps, 0, 'O1', 0.5, getDur);
    const trajO3Before = attackerTrajectoryAt(state.steps, 0, 'O3', 0.5, getDur);

    // Modifie le timing de O5 (décalé de 0.4→0.8s, fin 1.4→1.8s).
    const newState: AppState = {
      ...state,
      steps: state.steps.map((s, i) =>
        i === 0
          ? {
              ...s,
              annotations: s.annotations.map((a) =>
                a.fromId === 'O5'
                  ? { ...a, tStartAbs: 0.8, tEndAbs: 1.8 }
                  : a,
              ),
            }
          : s,
      ),
    };
    const trajO1After = attackerTrajectoryAt(newState.steps, 0, 'O1', 0.5, getDur);
    const trajO3After = attackerTrajectoryAt(newState.steps, 0, 'O3', 0.5, getDur);

    expect(trajO1After.position.x).toBeCloseTo(trajO1Before.position.x, 3);
    expect(trajO1After.position.y).toBeCloseTo(trajO1Before.position.y, 3);
    expect(trajO3After.position.x).toBeCloseTo(trajO3Before.position.x, 3);
    expect(trajO3After.position.y).toBeCloseTo(trajO3Before.position.y, 3);
  });
});
