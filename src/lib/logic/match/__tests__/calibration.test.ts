// Tests Phase I B5 — calibration live vs Monte-Carlo.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  compareCalibration,
  runHeadlessGameLoop,
  PPP_TOLERANCE,
} from '../calibration';

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

describe('calibration — runHeadlessGameLoop', () => {
  it('joue le nombre de possessions demandé et produit des stats cohérentes', () => {
    const baseState = buildState('pnr-central');
    const stats = runHeadlessGameLoop(baseState, 20, { seed: 42 });

    expect(stats.possessions).toBe(20);
    expect(stats.totalPoints).toBeGreaterThanOrEqual(0);
    expect(stats.ppp).toBe(stats.totalPoints / stats.possessions);
    expect(stats.scoreRate).toBeGreaterThanOrEqual(0);
    expect(stats.scoreRate).toBeLessThanOrEqual(1);
    // Sum des outcomes = possessions jouées
    const sumOutcomes = Object.values(stats.outcomes).reduce((a, b) => a + b, 0);
    expect(sumOutcomes).toBe(20);
    // PPP réaliste sur un PnR : entre 0.3 et 2.5 (très large bande pour V1)
    expect(stats.ppp).toBeGreaterThan(0.2);
    expect(stats.ppp).toBeLessThan(2.5);
  });

  it('est déterministe : même seed produit les mêmes stats', () => {
    const baseState = buildState('pnr-central');
    const a = runHeadlessGameLoop(baseState, 10, { seed: 100 });
    const b = runHeadlessGameLoop(baseState, 10, { seed: 100 });
    expect(a.totalPoints).toBe(b.totalPoints);
    expect(a.ppp).toBe(b.ppp);
    expect(a.outcomes).toEqual(b.outcomes);
  });

  it("produit des stats live spécifiques (cuts, passes, possession duration)", () => {
    const baseState = buildState('pnr-central');
    const stats = runHeadlessGameLoop(baseState, 30, { seed: 7 });
    // Une possession dure entre quelques 100aines de ms (turnover rapide)
    // et 24 s + 1.5 s pause (forced shot après shot clock). À 30 Hz,
    // plage normale 0.2-15 s, moyenne 1-5 s.
    expect(stats.liveOnlyStats.avgPossessionDurationS).toBeGreaterThan(0.2);
    expect(stats.liveOnlyStats.avgPossessionDurationS).toBeLessThan(30);
    expect(stats.liveOnlyStats.avgEventsPerPossession).toBeGreaterThanOrEqual(0.5);
  });
});

describe('calibration — compareCalibration', () => {
  it('produit un report comparatif valide', () => {
    const baseState = buildState('pnr-central');
    const report = compareCalibration(baseState, 30, { seed: 11 });
    expect(report.liveStats.possessions).toBe(30);
    expect(report.simulatorStats.runs).toBe(30);
    expect(typeof report.delta.ppp).toBe('number');
    expect(typeof report.delta.efgPct).toBe('number');
    expect(typeof report.withinTolerance).toBe('boolean');
    expect(Array.isArray(report.suggestions)).toBe(true);
  });

  it("classe `withinTolerance=true` quand |Δ PPP| ≤ PPP_TOLERANCE", () => {
    const baseState = buildState('pnr-central');
    const report = compareCalibration(baseState, 100, { seed: 23 });
    // Sur 100 possessions, la variance se lisse. On vérifie juste la
    // cohérence du flag.
    expect(report.withinTolerance).toBe(Math.abs(report.delta.ppp) <= PPP_TOLERANCE);
  });

  it('ajoute une suggestion quand l\'écart PPP dépasse la tolérance', () => {
    const baseState = buildState('pnr-central');
    const report = compareCalibration(baseState, 30, { seed: 31 });
    if (!report.withinTolerance) {
      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.suggestions.some((s) => s.toLowerCase().includes('ppp'))).toBe(true);
    }
  });
});
