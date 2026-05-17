// B.1 — Tests pour la durée individuelle par step (`step.duration`).
// Vérifie : helper getStepDurationSeconds, accumulation correcte dans
// realStepToSeconds et totalDurationSeconds, rétrocompat sans duration,
// gestion des steps interpolés (exclus de la timeline narrative).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, Step } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import {
  getStepDurationSeconds,
  realStepToSeconds,
  totalDurationSeconds,
  getSecondsPerStep,
} from '@/lib/logic/timecode';

const POS: AttackerPositions = {
  O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
  O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
};

function makeState(steps: Step[], extra: Partial<AppState> = {}): AppState {
  return { ...makeInitialState(), steps, activeStep: 0, ...extra };
}

function step(partial: Partial<Step> = {}): Step {
  return { off: POS, ballCarrier: 'O1', annotations: [], ...partial };
}

describe('B.1 — getStepDurationSeconds', () => {
  it('renvoie state.secondsPerStep si step.duration absent', () => {
    const s = makeState([step()], { secondsPerStep: 4 });
    expect(getStepDurationSeconds(s, 0)).toBe(4);
  });

  it('renvoie step.duration si défini et valide', () => {
    const s = makeState([step({ duration: 1.5 })], { secondsPerStep: 4 });
    expect(getStepDurationSeconds(s, 0)).toBe(1.5);
  });

  it('retombe sur le default global si step.duration vaut 0 ou négatif', () => {
    const s = makeState([step({ duration: 0 }), step({ duration: -2 })], { secondsPerStep: 3 });
    expect(getStepDurationSeconds(s, 0)).toBe(3);
    expect(getStepDurationSeconds(s, 1)).toBe(3);
  });

  it('retombe sur le default global si step.duration vaut NaN/Infinity', () => {
    const s = makeState([step({ duration: NaN }), step({ duration: Infinity })], { secondsPerStep: 2 });
    expect(getStepDurationSeconds(s, 0)).toBe(2);
    expect(getStepDurationSeconds(s, 1)).toBe(2);
  });

  it('sécurise un stepIdx hors bornes', () => {
    const s = makeState([step()], { secondsPerStep: 4 });
    expect(getStepDurationSeconds(s, 99)).toBe(4);
    expect(getStepDurationSeconds(s, -1)).toBe(4);
  });
});

describe('B.1 — totalDurationSeconds', () => {
  it('renvoie 0 pour 0 ou 1 step réel', () => {
    expect(totalDurationSeconds(makeState([]))).toBe(0);
    expect(totalDurationSeconds(makeState([step()]))).toBe(0);
  });

  it('somme les durations individuelles (mix de durations définies et non définies)', () => {
    const s = makeState(
      [
        step({ duration: 1.5 }),
        step({ duration: 0.8 }),
        step(),
      ],
      { secondsPerStep: 4 }
    );
    // transitions : step0(1.5) + step1(0.8) = 2.3s (step2 = dernier, sa duration ne compte pas)
    expect(totalDurationSeconds(s)).toBeCloseTo(2.3, 5);
  });

  it('rétrocompat : sans aucun duration, équivaut à (N-1) × secondsPerStep', () => {
    const s = makeState([step(), step(), step(), step()], { secondsPerStep: 4 });
    expect(totalDurationSeconds(s)).toBe(12);
  });

  it('ignore les steps interpolés dans le compte des transitions', () => {
    const s = makeState(
      [
        step({ duration: 2 }),
        step({ isInterpolated: true, duration: 99 }),
        step({ duration: 3 }),
      ],
      { secondsPerStep: 4 }
    );
    // Real steps: indices 0, 2 → une seule transition de duration(0) = 2s
    expect(totalDurationSeconds(s)).toBe(2);
  });
});

describe('B.1 — realStepToSeconds', () => {
  it('renvoie 0 au step 0', () => {
    const s = makeState([step({ duration: 2 }), step({ duration: 3 })]);
    expect(realStepToSeconds(s, 0)).toBe(0);
  });

  it('cumule les durations entières', () => {
    const s = makeState([
      step({ duration: 1.5 }),
      step({ duration: 2 }),
      step({ duration: 5 }), // dernier — sa durée ne compte pas
    ]);
    expect(realStepToSeconds(s, 1)).toBeCloseTo(1.5, 5);
    expect(realStepToSeconds(s, 2)).toBeCloseTo(3.5, 5);
  });

  it('interpole linéairement les valeurs fractionnaires', () => {
    const s = makeState([
      step({ duration: 2 }),
      step({ duration: 4 }),
      step({ duration: 1 }),
    ]);
    // 0.5 → 50% de duration(0)=2 → 1.0
    expect(realStepToSeconds(s, 0.5)).toBeCloseTo(1.0, 5);
    // 1.5 → duration(0)=2 + 50% de duration(1)=4 → 2 + 2 = 4
    expect(realStepToSeconds(s, 1.5)).toBeCloseTo(4.0, 5);
  });

  it('clamp à 0 pour les index négatifs', () => {
    const s = makeState([step({ duration: 2 }), step({ duration: 2 })]);
    expect(realStepToSeconds(s, -5)).toBe(0);
  });

  it('rétrocompat : sans duration, équivaut à realStepIdx × secondsPerStep', () => {
    const s = makeState([step(), step(), step()], { secondsPerStep: 4 });
    expect(realStepToSeconds(s, 0)).toBe(0);
    expect(realStepToSeconds(s, 1)).toBe(4);
    expect(realStepToSeconds(s, 1.5)).toBe(6);
    expect(realStepToSeconds(s, 2)).toBe(8);
  });

  it("extrapole avec getSecondsPerStep au-delà du dernier real step (utile pour shotClockAt)", () => {
    const s = makeState(
      [step({ duration: 2 }), step({ duration: 3 })],
      { secondsPerStep: 4 }
    );
    // Au dernier real step : juste la duration cumulée.
    expect(realStepToSeconds(s, 1)).toBe(2);
    // Au-delà : ajoute la valeur globale (sps = 4) per "step manquant" pour
    // que shotClockAt puisse continuer à clamper même hors timeline.
    expect(realStepToSeconds(s, 1.5)).toBeCloseTo(2 + 0.5 * 4, 5);
    expect(realStepToSeconds(s, 3)).toBeCloseTo(2 + 2 * 4, 5);
  });

  it('cohérence end-to-end : realStepToSeconds(N-1) === totalDurationSeconds', () => {
    const s = makeState([
      step({ duration: 1.2 }),
      step({ duration: 0.8 }),
      step({ duration: 3.5 }),
      step(),
    ], { secondsPerStep: 4 });
    // 4 real steps, 3 transitions : 1.2 + 0.8 + 3.5 = 5.5
    expect(totalDurationSeconds(s)).toBeCloseTo(5.5, 5);
    expect(realStepToSeconds(s, 3)).toBeCloseTo(totalDurationSeconds(s), 5);
  });
});

describe('B.1 — orthogonalité getSecondsPerStep / step.duration', () => {
  it('un step sans duration suit getSecondsPerStep, un autre avec duration la garde', () => {
    const s = makeState([step({ duration: 1 }), step(), step()], { secondsPerStep: 4 });
    expect(getStepDurationSeconds(s, 0)).toBe(1);
    expect(getStepDurationSeconds(s, 1)).toBe(4);
    expect(getSecondsPerStep(s)).toBe(4);
  });
});
