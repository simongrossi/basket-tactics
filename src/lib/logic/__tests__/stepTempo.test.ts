// Tempo selon la distance : durée d'étape déduite de la plus longue course.

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, Step } from '@/lib/types';
import { PX_PER_M } from '@/lib/data/court';
import { makeInitialState } from '@/lib/data/initial';
import { getStepDurationSeconds, totalDurationSeconds } from '@/lib/logic/timecode';
import {
  TEMPO_MAX_SECONDS,
  TEMPO_MIN_SECONDS,
  distanceTempoSeconds,
} from '@/lib/logic/stepTempo';

const POS: AttackerPositions = {
  O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 530, y: 380 },
  O4: { x: 180, y: 200 }, O5: { x: 420, y: 200 },
};

function step(partial: Partial<Step> = {}): Step {
  return { off: POS, ballCarrier: 'O1', annotations: [], ...partial };
}

function moved(dxM: number): Step {
  return step({ off: { ...POS, O1: { x: POS.O1.x, y: POS.O1.y - dxM * PX_PER_M } } });
}

function state(steps: Step[], extra: Partial<AppState> = {}): AppState {
  return { ...makeInitialState(), realismProfile: 'realistic', steps, activeStep: 0, ...extra };
}

describe('distanceTempoSeconds', () => {
  it('étape sans course : durée minimale', () => {
    expect(distanceTempoSeconds([step(), step()], 0)).toBe(TEMPO_MIN_SECONDS);
  });

  it('croît avec la distance, plafonnée à l’ancien défaut', () => {
    const short = distanceTempoSeconds([step(), moved(4)], 0)!;
    const long = distanceTempoSeconds([step(), moved(8)], 0)!;
    expect(long).toBeGreaterThan(short);
    expect(distanceTempoSeconds([step(), moved(30)], 0)).toBe(TEMPO_MAX_SECONDS);
  });

  it('une annotation sur une fenêtre partielle allonge l’étape', () => {
    const to = { x: POS.O1.x, y: POS.O1.y - 6 * PX_PER_M };
    const full = distanceTempoSeconds([step({
      annotations: [{ type: 'cut', fromId: 'O1', from: POS.O1, to }],
    }), moved(6)], 0)!;
    const partial = distanceTempoSeconds([step({
      annotations: [{ type: 'cut', fromId: 'O1', from: POS.O1, to, tStart: 0.5, tEnd: 1 }],
    }), moved(6)], 0)!;
    expect(partial).toBeGreaterThan(full);
  });

  it('dernière étape : pas de transition', () => {
    expect(distanceTempoSeconds([step(), step()], 1)).toBeUndefined();
  });
});

describe('getStepDurationSeconds et tempo selon la distance', () => {
  it('profil réaliste sans durée explicite : tempo calculé', () => {
    const s = state([step(), moved(6)]);
    expect(getStepDurationSeconds(s, 0)).toBe(distanceTempoSeconds(s.steps, 0));
    expect(totalDurationSeconds(s)).toBeLessThan(4);
  });

  it('step.duration et secondsPerStep explicites restent prioritaires', () => {
    expect(getStepDurationSeconds(state([step({ duration: 3 }), moved(6)]), 0)).toBe(3);
    expect(getStepDurationSeconds(state([step(), moved(6)], { secondsPerStep: 2.5 }), 0)).toBe(2.5);
  });

  it('profil legacy ou flag coupé : défaut historique 4 s', () => {
    expect(getStepDurationSeconds({ ...state([step(), moved(6)]), realismProfile: undefined }, 0)).toBe(4);
    expect(getStepDurationSeconds(state([step(), moved(6)], { distanceTempoEnabled: false }), 0)).toBe(4);
  });
});
