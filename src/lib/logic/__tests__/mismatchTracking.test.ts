// Tests B1 — mismatch tracking + scram switch.

import { describe, expect, it } from 'vitest';
import type { AttackerPositions, DefenderPositions, DetectedScreen, Matchups } from '@/lib/types';
import {
  applyScramSwitch,
  attackerRank,
  defenderRank,
  mismatchSeverity,
  computeAllMismatchSeverities,
} from '../defense/mismatchTracking';

const baseMatchups: Matchups = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

const baseOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

// Pour les scénarios scram, on positionne les défenseurs à leur natural homePos.
const baseDef: DefenderPositions = {
  D1: { x: 300, y: 380 },
  D2: { x: 170, y: 310 },
  D3: { x: 430, y: 310 },
  D4: { x: 240, y: 160 },
  D5: { x: 360, y: 160 },
};

describe('rank helpers', () => {
  it('defenderRank et attackerRank décodent le numéro', () => {
    expect(defenderRank('D1')).toBe(1);
    expect(defenderRank('D5')).toBe(5);
    expect(attackerRank('O1')).toBe(1);
    expect(attackerRank('O3')).toBe(3);
  });
});

describe('mismatchSeverity', () => {
  it('vaut 0 pour un matchup naturel', () => {
    expect(mismatchSeverity('D1', 'O1')).toBe(0);
    expect(mismatchSeverity('D5', 'O5')).toBe(0);
  });

  it("croît avec l'écart de rang", () => {
    expect(mismatchSeverity('D1', 'O2')).toBe(1);
    expect(mismatchSeverity('D1', 'O3')).toBe(2);
    expect(mismatchSeverity('D5', 'O1')).toBe(4); // pivot sur meneur, pire
    expect(mismatchSeverity('D1', 'O5')).toBe(4); // meneur sur pivot, pire
  });

  it("est symétrique", () => {
    expect(mismatchSeverity('D3', 'O1')).toBe(mismatchSeverity('D1', 'O3'));
  });
});

describe('computeAllMismatchSeverities', () => {
  it('zéros sur matchups naturels', () => {
    const out = computeAllMismatchSeverities(baseMatchups);
    expect(out).toEqual({ D1: 0, D2: 0, D3: 0, D4: 0, D5: 0 });
  });

  it('reflète les swaps', () => {
    const swapped: Matchups = { ...baseMatchups, D1: 'O5', D5: 'O1' };
    const out = computeAllMismatchSeverities(swapped);
    expect(out.D1).toBe(4);
    expect(out.D5).toBe(4);
    expect(out.D2).toBe(0); // intact
  });
});

describe('applyScramSwitch — pas de scram', () => {
  it('no-op si pas de mismatch (severity 0)', () => {
    const screen: DetectedScreen = {
      screener: 'O3', screenerDef: 'D3', carrier: 'O1', carrierDef: 'D1',
      screenerPos: baseOff.O3,
    };
    // matchups inchangés (D1↔D3 swap qui ne change rien : D1→O3, D3→O1, severity 2 chacun)
    const noMismatch: Matchups = { ...baseMatchups };
    const result = applyScramSwitch(noMismatch, screen, baseOff, baseDef);
    expect(result.scram).toBeNull();
    expect(result.matchups).toBe(noMismatch);
  });

  it("no-op si severity < threshold (seuil 3)", () => {
    // Switch D2↔D3 produit severity 1 chacun (D2 sur O3, D3 sur O2)
    const screen: DetectedScreen = {
      screener: 'O3', screenerDef: 'D3', carrier: 'O2', carrierDef: 'D2',
      screenerPos: baseOff.O3,
    };
    const switched: Matchups = { ...baseMatchups, D2: 'O3', D3: 'O2' };
    const result = applyScramSwitch(switched, screen, baseOff, baseDef, { threshold: 3 });
    expect(result.scram).toBeNull();
  });
});

describe('applyScramSwitch — cas D5 sur O1 (mismatch extrême)', () => {
  it("propose un scram avec un défenseur compatible proche", () => {
    // Scénario : O1/O5 ont posé un écran, switch a inversé → D5 sur O1, D1 sur O5
    // D3 (wing) est positionné proche de O1 pour pouvoir scramer.
    const screen: DetectedScreen = {
      screener: 'O5', screenerDef: 'D5', carrier: 'O1', carrierDef: 'D1',
      screenerPos: baseOff.O5,
    };
    const switched: Matchups = { ...baseMatchups, D1: 'O5', D5: 'O1' };
    // D3 proche de O1 (le porteur exposé). On déplace D3 vers O1.
    const def: DefenderPositions = { ...baseDef, D3: { x: 310, y: 460 } };

    const result = applyScramSwitch(switched, screen, baseOff, def, { threshold: 2 });

    expect(result.scram).not.toBeNull();
    expect(result.scram!.replacedOn).toBe('O1'); // D3 vient prendre O1
    // Le défenseur "from" doit être celui qui était en mismatch sur O1 = D5
    expect(result.scram!.from).toBe('D5');
    expect(result.scram!.to).toBe('D3');
    // Le from récupère le matchup naturel du to (D5 va sur O3)
    expect(result.matchups.D5).toBe('O3');
    expect(result.matchups.D3).toBe('O1');
    // Severities après scram : D3 sur O1 = 2, D5 sur O3 = 2 (au lieu de 4 et 0).
    expect(result.scram!.severityAfter).toBeLessThan(result.scram!.severityBefore);
  });

  it("refuse de scramer si aucun candidat n'est assez proche", () => {
    const screen: DetectedScreen = {
      screener: 'O5', screenerDef: 'D5', carrier: 'O1', carrierDef: 'D1',
      screenerPos: baseOff.O5,
    };
    const switched: Matchups = { ...baseMatchups, D1: 'O5', D5: 'O1' };
    // Tous les défenseurs sont à >200px de O1 (le mismatch exposé).
    // O1 est à (300, 470). On éloigne les candidats potentiels (D2, D3, D4).
    const def: DefenderPositions = {
      ...baseDef,
      D2: { x: 50, y: 50 },
      D3: { x: 550, y: 50 },
      D4: { x: 50, y: 100 },
    };
    const result = applyScramSwitch(switched, screen, baseOff, def, {
      threshold: 2,
      maxScramDistance: 100,
    });
    expect(result.scram).toBeNull();
  });

  it("refuse de scramer si l'amélioration totale est < 2", () => {
    // Switch D4↔D5 : D5 sur O4 = severity 1, D4 sur O5 = severity 1
    // Aucun scram ne ferait mieux → no-op
    const screen: DetectedScreen = {
      screener: 'O5', screenerDef: 'D5', carrier: 'O4', carrierDef: 'D4',
      screenerPos: baseOff.O5,
    };
    const switched: Matchups = { ...baseMatchups, D4: 'O5', D5: 'O4' };
    const result = applyScramSwitch(switched, screen, baseOff, baseDef, { threshold: 1 });
    // Même avec threshold 1, l'amélioration potentielle est trop faible (< 2).
    expect(result.scram).toBeNull();
  });
});

describe('applyScramSwitch — monotone', () => {
  it('severityAfter ≤ severityBefore quand un scram est trouvé', () => {
    const screen: DetectedScreen = {
      screener: 'O5', screenerDef: 'D5', carrier: 'O1', carrierDef: 'D1',
      screenerPos: baseOff.O5,
    };
    const switched: Matchups = { ...baseMatchups, D1: 'O5', D5: 'O1' };
    const def: DefenderPositions = { ...baseDef, D3: { x: 310, y: 460 } };
    const result = applyScramSwitch(switched, screen, baseOff, def);
    expect(result.scram).not.toBeNull();
    expect(result.scram!.severityAfter).toBeLessThanOrEqual(result.scram!.severityBefore);
  });
});
