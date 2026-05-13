import { describe, expect, it } from 'vitest';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { addAnnotation } from '../annotationTransforms';
import {
  setAnnotationFrom,
  setAnnotationTo,
  setAnnotationWaypoint,
} from '../annotationEndpointTransforms';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import type { AppState, Annotation } from '@/lib/types';

/** Crée un state avec une 2ᵉ étape (vide) pour que les annotations de mouvement
 *  aient une cible aval. */
function stateWithTwoSteps(): AppState {
  const s0 = makeInitialState();
  const next = makeStep({ ...s0.steps[0].off }, s0.steps[0].ballCarrier, []);
  return { ...s0, steps: [s0.steps[0], next] };
}

describe('setAnnotationTo — phase end (défaut)', () => {
  it('déplace step[stepIdx+1].off[fromId] et recale anno.to', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'cut',
      fromId: 'O3',
      from: { x: s.steps[0].off.O3.x, y: s.steps[0].off.O3.y },
      to: { x: 300, y: 500 },
    };
    const s1 = addAnnotation(s, ann);
    // Cible en zone vide (coin bas-droite) pour éviter le push-out.
    const next = setAnnotationTo(s1, 0, s1.steps[0].annotations.length - 1, { x: 550, y: 500 });
    expect(next.steps[1].off.O3.x).toBe(550);
    expect(next.steps[1].off.O3.y).toBe(500);
    expect(next.steps[0].annotations[next.steps[0].annotations.length - 1].to).toEqual({ x: 550, y: 500 });
  });

  it('respecte le push-out (Règle 1) si on relâche sur un autre joueur', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'cut',
      fromId: 'O3',
      from: { x: s.steps[0].off.O3.x, y: s.steps[0].off.O3.y },
      to: { x: 400, y: 400 },
    };
    const s1 = addAnnotation(s, ann);
    // Cible directement sur O2 → doit être repoussé à clearance.
    const o2 = s1.steps[1].off.O2;
    const next = setAnnotationTo(s1, 0, s1.steps[0].annotations.length - 1, { x: o2.x, y: o2.y });
    const o3New = next.steps[1].off.O3;
    const d = Math.hypot(o3New.x - o2.x, o3New.y - o2.y);
    expect(d).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });
});

describe('setAnnotationTo — phase start', () => {
  it('met à jour step[stepIdx].off ET step[stepIdx+1].off (action active dès le début)', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'screen',
      fromId: 'O5',
      from: { x: s.steps[0].off.O5.x, y: s.steps[0].off.O5.y },
      to: { x: 350, y: 280 },
      phase: 'start',
    };
    // Phase start nécessite un step amont — donc on insère sur step 1 avec stepIdx=1.
    const s2 = { ...s, steps: [s.steps[0], { ...s.steps[1], annotations: [ann] }] };
    const next = setAnnotationTo(s2, 1, 0, { x: 540, y: 500 });
    expect(next.steps[1].off.O5.x).toBe(540);
    expect(next.steps[1].off.O5.y).toBe(500);
    // Phase start n'a pas de step aval ici, donc pas de cascade — OK.
  });
});

describe('setAnnotationFrom', () => {
  it('déplace step[stepIdx].off[fromId] (= point de départ de l\'action)', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'cut',
      fromId: 'O3',
      from: { x: s.steps[0].off.O3.x, y: s.steps[0].off.O3.y },
      to: { x: 350, y: 350 },
    };
    const s1 = addAnnotation(s, ann);
    const next = setAnnotationFrom(s1, 0, s1.steps[0].annotations.length - 1, { x: 540, y: 520 });
    expect(next.steps[0].off.O3.x).toBe(540);
    expect(next.steps[0].off.O3.y).toBe(520);
    // L'annotation a aussi son `from` recalé via la cascade aval.
    const annoUpdated = next.steps[0].annotations[next.steps[0].annotations.length - 1];
    expect(annoUpdated.from).toEqual({ x: 540, y: 520 });
  });
});

describe('setAnnotationWaypoint', () => {
  it('met à jour le waypoint à l\'index donné, garde les autres', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'cut',
      fromId: 'O3',
      from: { x: 100, y: 400 },
      to: { x: 400, y: 100 },
      waypoints: [{ x: 200, y: 300 }, { x: 300, y: 200 }],
    };
    const s1 = addAnnotation(s, ann);
    const next = setAnnotationWaypoint(s1, 0, s1.steps[0].annotations.length - 1, 1, { x: 280, y: 220 });
    const wps = next.steps[0].annotations[next.steps[0].annotations.length - 1].waypoints!;
    expect(wps[0]).toEqual({ x: 200, y: 300 });
    expect(wps[1]).toEqual({ x: 280, y: 220 });
  });

  it('no-op si wpIdx hors bornes', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'cut',
      fromId: 'O3',
      from: { x: 100, y: 400 },
      to: { x: 400, y: 100 },
      waypoints: [{ x: 200, y: 300 }],
    };
    const s1 = addAnnotation(s, ann);
    const next = setAnnotationWaypoint(s1, 0, s1.steps[0].annotations.length - 1, 5, { x: 999, y: 999 });
    expect(next).toBe(s1); // référence identique car no-op
  });

  it('no-op si annotation sans waypoints', () => {
    const s = stateWithTwoSteps();
    const ann: Annotation = {
      type: 'cut',
      fromId: 'O3',
      from: { x: s.steps[0].off.O3.x, y: s.steps[0].off.O3.y },
      to: { x: 400, y: 100 },
    };
    const s1 = addAnnotation(s, ann);
    const next = setAnnotationWaypoint(s1, 0, s1.steps[0].annotations.length - 1, 0, { x: 250, y: 250 });
    expect(next).toBe(s1);
  });
});

describe('no-op cases', () => {
  it('setAnnotationTo sur une annotation pass : pas de mutation', () => {
    const s = stateWithTwoSteps();
    const pass: Annotation = {
      type: 'pass',
      fromId: 'O1',
      toId: 'O3',
      from: { x: s.steps[0].off.O1.x, y: s.steps[0].off.O1.y },
      to: { x: s.steps[0].off.O3.x, y: s.steps[0].off.O3.y },
    };
    const s1 = addAnnotation(s, pass);
    const next = setAnnotationTo(s1, 0, s1.steps[0].annotations.length - 1, { x: 999, y: 999 });
    expect(next).toBe(s1);
  });

  it('setAnnotationFrom avec annoIdx invalide : no-op', () => {
    const s = stateWithTwoSteps();
    const next = setAnnotationFrom(s, 0, 99, { x: 100, y: 100 });
    expect(next).toBe(s);
  });
});
