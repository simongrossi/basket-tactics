import { describe, it, expect } from 'vitest';
import { computeDefenseTargets } from '../engine';
import { makeInitialState, makeStep } from '../../data/initial';
import type { AppState, AttackerPositions } from '../../types';

const HOOP = { x: 300, y: 75 };

const cloneState = (): AppState => structuredClone(makeInitialState());

describe('applyRimProtectionLayer (man defense)', () => {
  it('porteur en raquette → carrierDef est sur lui (priorité standard)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 130 }, // porteur dans la raquette
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const s = cloneState();
    s.defenseSystem = 'man';
    s.steps = [makeStep(off, 'O1', [])];
    const { positions } = computeDefenseTargets(s, 0, false);
    // D1 carrier defender doit être proche de O1.
    expect(positions.D1.isCarrierDefender).toBe(true);
    const dD1 = Math.hypot(positions.D1.x - 300, positions.D1.y - 130);
    expect(dD1).toBeLessThan(60);
  });

  it('cutter raquette : matchup naturel le suit (D3 suit O3 même en cut)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 350, y: 130 }, // O3 dans la raquette (a coupé)
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const s = cloneState();
    s.defenseSystem = 'man';
    s.steps = [makeStep(off, 'O1', [])];
    const { positions } = computeDefenseTargets(s, 0, false);
    // D3 doit être proche de O3 (matchup naturel).
    const dD3 = Math.hypot(positions.D3.x - 350, positions.D3.y - 130);
    expect(dD3).toBeLessThan(60);
  });

  it('aucune erreur si tous les attaquants sont loin du panier', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 100, y: 470 },
      O3: { x: 500, y: 470 },
      O4: { x: 130, y: 380 },
      O5: { x: 470, y: 380 },
    };
    const s = cloneState();
    s.defenseSystem = 'man';
    s.steps = [makeStep(off, 'O1', [])];
    expect(() => computeDefenseTargets(s, 0, false)).not.toThrow();
  });
});
