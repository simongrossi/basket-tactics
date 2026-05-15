// Tests inbound — vérifie que convertStepToInbound place correctement
// les joueurs hors-ligne et que le context est correctement marqué.

import { describe, it, expect } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { convertStepToInbound } from '../transforms/stepTransforms';
import { COURT } from '@/lib/data/court';

describe('convertStepToInbound — baseline (BLOB)', () => {
  it('pose context=inbound-baseline + manualOverride + carrier=O1', () => {
    const s = makeInitialState();
    const next = convertStepToInbound(s, 'inbound-baseline');
    const step = next.steps[next.activeStep];
    expect(step.context).toBe('inbound-baseline');
    expect(step.manualOverride).toBe(true);
    expect(step.ballCarrier).toBe('O1');
  });

  it('place le passeur (O1) hors-ligne, derrière la baseline', () => {
    const s = makeInitialState();
    const next = convertStepToInbound(s, 'inbound-baseline');
    const step = next.steps[next.activeStep];
    // Baseline FIBA = y=20 (COURT.marginY). Passeur doit être au-dessus
    // (y < marginY), donc hors du terrain.
    expect(step.off.O1.y).toBeLessThan(COURT.marginY);
  });

  it('place les 4 autres attaquants dans la moitié offensive (zone Box)', () => {
    const s = makeInitialState();
    const next = convertStepToInbound(s, 'inbound-baseline');
    const step = next.steps[next.activeStep];
    // O2-O5 doivent être dans le terrain (y > marginY) et près du panier
    // (y < 200 = environ raquette).
    ['O2', 'O3', 'O4', 'O5'].forEach((id) => {
      const p = step.off[id as 'O2'];
      expect(p.y).toBeGreaterThan(COURT.marginY);
      expect(p.y).toBeLessThan(200);
    });
  });

  it('vide les annotations existantes du step', () => {
    const s = makeInitialState();
    // Ajoute une annotation factice
    s.steps[s.activeStep] = {
      ...s.steps[s.activeStep],
      annotations: [{ type: 'pass', fromId: 'O1', toId: 'O2', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }],
    };
    const next = convertStepToInbound(s, 'inbound-baseline');
    expect(next.steps[next.activeStep].annotations).toEqual([]);
  });

  it('pose defenseOverrides pour figer le placement défensif face à face', () => {
    const s = makeInitialState();
    const next = convertStepToInbound(s, 'inbound-baseline');
    const step = next.steps[next.activeStep];
    expect(step.defenseOverrides).toBeDefined();
    expect(Object.keys(step.defenseOverrides ?? {})).toHaveLength(5);
  });
});

describe('convertStepToInbound — sideline (SLOB)', () => {
  it("SLOB low : passeur hors-ligne côté droit (x > innerMaxX)", () => {
    const s = makeInitialState();
    const next = convertStepToInbound(s, 'inbound-sideline-low');
    const step = next.steps[next.activeStep];
    expect(step.context).toBe('inbound-sideline-low');
    expect(step.off.O1.x).toBeGreaterThan(COURT.innerMaxX);
  });

  it("SLOB high : passeur hors-ligne côté droit, en moitié défensive (y > 400)", () => {
    const s = makeInitialState();
    const next = convertStepToInbound(s, 'inbound-sideline-high');
    const step = next.steps[next.activeStep];
    expect(step.context).toBe('inbound-sideline-high');
    expect(step.off.O1.x).toBeGreaterThan(COURT.innerMaxX);
    expect(step.off.O1.y).toBeGreaterThan(400);
  });
});

describe('convertStepToInbound — robustness', () => {
  it("ne crash pas et garde le state si activeStep pointe sur step inexistant", () => {
    const s = makeInitialState();
    const broken = { ...s, activeStep: 99 };
    const result = convertStepToInbound(broken, 'inbound-baseline');
    // Pas de crash, retour identique (steps[99] est undefined)
    expect(result).toBe(broken);
  });
});
