// Tests K.6 — Intégration playerAnomalyRule dans le pipeline coachDiagnostics.

import { describe, expect, it } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { computeCoachDiagnostics } from '../coachDiagnostics';

function makeStaticState(): AppState {
  const s0 = makeInitialState();
  const off = {
    O1: { x: 100, y: 500 },
    O2: { x: 200, y: 500 },
    O3: { x: 300, y: 500 },
    O4: { x: 400, y: 500 },
    O5: { x: 500, y: 500 },
  };
  return {
    ...s0,
    steps: [
      { ...s0.steps[0], off, ballCarrier: 'O1' as const },
      makeStep(off, 'O1', []),
      makeStep(off, 'O1', []),
    ],
    activeStep: 1,
  };
}

describe('K.6 — playerAnomalyRule (intégration coach)', () => {
  it('inactive par défaut (anomalyDetectionEnabled !== true)', () => {
    const state = makeStaticState();
    const diags = computeCoachDiagnostics(state, 1);
    expect(diags.some((d) => d.tag.startsWith('anomaly-'))).toBe(false);
  });

  it('aucune anomalie sur un scénario statique trivial avec flag activé', () => {
    const state = { ...makeStaticState(), anomalyDetectionEnabled: true };
    const diags = computeCoachDiagnostics(state, 1);
    expect(diags.some((d) => d.tag.startsWith('anomaly-'))).toBe(false);
  });

  it('flag téléportation quand un attaquant saute > 24 px entre 2 steps', () => {
    const base = makeStaticState();
    // Step 0 = O1 à (100, 500). Step 1 = O1 saute à (200, 500) → 100 px.
    const off0 = base.steps[0].off;
    const off1 = { ...off0, O1: { x: 200, y: 500 } };
    const state: AppState = {
      ...base,
      anomalyDetectionEnabled: true,
      steps: [
        base.steps[0],
        { ...base.steps[1], off: off1 },
        base.steps[2],
      ],
      activeStep: 1,
    };
    const diags = computeCoachDiagnostics(state, 1);
    const teleport = diags.find((d) => d.tag === 'anomaly-teleport');
    expect(teleport).toBeDefined();
    expect(teleport?.attackers).toContain('O1');
  });

  it('flag décroché (K.3) en man-to-man uniquement', () => {
    // Construit un état où D1 est très loin de O1 sans aide ni screen.
    const base = makeStaticState();
    const state: AppState = {
      ...base,
      anomalyDetectionEnabled: true,
      defenseSystem: 'man',
      steps: [
        {
          ...base.steps[0],
          // O1 reste à (100, 500), D1 placé à (100, 100) → 400 px de distance
          defenseOverrides: { D1: { x: 100, y: 100 } },
        },
        base.steps[1],
        base.steps[2],
      ],
      activeStep: 0,
    };
    const diags = computeCoachDiagnostics(state, 0);
    const detached = diags.find((d) => d.tag === 'anomaly-detached');
    expect(detached).toBeDefined();
    expect(detached?.defenders).toContain('D1');
  });

  it('skip décroché si defenseSystem !== man (zone par ex.)', () => {
    const base = makeStaticState();
    const state: AppState = {
      ...base,
      anomalyDetectionEnabled: true,
      defenseSystem: 'zone',
      steps: [
        { ...base.steps[0], defenseOverrides: { D1: { x: 100, y: 100 } } },
        base.steps[1],
        base.steps[2],
      ],
      activeStep: 0,
    };
    const diags = computeCoachDiagnostics(state, 0);
    expect(diags.some((d) => d.tag === 'anomaly-detached')).toBe(false);
  });

  it('reportToDiagnostic conserve severity warning/critical', () => {
    const base = makeStaticState();
    // Saut critique : 100 px sur O1
    const off0 = base.steps[0].off;
    const off1 = { ...off0, O1: { x: 200, y: 500 } };
    const state: AppState = {
      ...base,
      anomalyDetectionEnabled: true,
      steps: [base.steps[0], { ...base.steps[1], off: off1 }, base.steps[2]],
      activeStep: 1,
    };
    const diags = computeCoachDiagnostics(state, 1);
    const teleport = diags.find((d) => d.tag === 'anomaly-teleport');
    expect(teleport?.severity).toBe('critical'); // 100 px > 60 px critical
  });

  it('flag flicker quand un attaquant fait un aller-retour violent sur 3 steps', () => {
    const base = makeStaticState();
    const off0 = base.steps[0].off;
    const off1 = { ...off0, O2: { x: 320, y: 500 } };
    const off2 = { ...off0, O2: { x: 200, y: 500 } };
    const state: AppState = {
      ...base,
      anomalyDetectionEnabled: true,
      steps: [
        { ...base.steps[0], off: off0 },
        { ...base.steps[1], off: off1 },
        { ...base.steps[2], off: off2 },
      ],
      activeStep: 2,
    };

    const diags = computeCoachDiagnostics(state, 2);
    const flicker = diags.find((d) => d.tag === 'anomaly-flicker');
    expect(flicker).toBeDefined();
    expect(flicker?.attackers).toContain('O2');
  });
});
