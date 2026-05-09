import { describe, it, expect } from 'vitest';
import { evaluateOffensiveOptions, bestOffensiveAction } from '../offense';
import { HOOP } from '../../data/court';
import type { AttackerPositions, ComputedDefense } from '../../types';

function makeDefPos(positions: Record<string, { x: number; y: number }>): ComputedDefense {
  const out = {} as ComputedDefense;
  (Object.keys(positions) as Array<keyof typeof positions>).forEach((dId) => {
    out[dId as 'D1' | 'D2' | 'D3' | 'D4' | 'D5'] = {
      x: positions[dId].x,
      y: positions[dId].y,
      late: false,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: 'O1',
      onScreen: false,
      switchedThisStep: false,
      orientation: 0,
      gazeOrientation: 0,
      facing: { x: 0, y: 0 },
      armBallSide: { x: 0, y: 0 },
      armManSide: { x: 0, y: 0 },
    };
  });
  return out;
}

describe('evaluateOffensiveOptions', () => {
  const off: AttackerPositions = {
    O1: { x: 300, y: 470 },  // top of arc (deep)
    O2: { x: 130, y: 380 },  // wing G
    O3: { x: 470, y: 380 },  // wing D
    O4: { x: 220, y: 230 },  // post G
    O5: { x: 305, y: 95 },   // dunk position (rim, ~21px du panier)
  };

  it('inclut au moins shoot et 4 passes', () => {
    const defPos = makeDefPos({
      D1: { x: 0, y: 0 }, D2: { x: 0, y: 0 }, D3: { x: 0, y: 0 },
      D4: { x: 0, y: 0 }, D5: { x: 0, y: 0 },
    });
    const actions = evaluateOffensiveOptions(off, defPos, 'O1', HOOP);
    const types = actions.map((a) => a.type);
    expect(types).toContain('shoot');
    const passActions = actions.filter((a) => a.type === 'pass-shoot');
    expect(passActions.length).toBe(4); // 4 receveurs possibles
  });

  it('inclut un drive si le porteur est loin du panier', () => {
    const defPos = makeDefPos({
      D1: { x: 0, y: 0 }, D2: { x: 0, y: 0 }, D3: { x: 0, y: 0 },
      D4: { x: 0, y: 0 }, D5: { x: 0, y: 0 },
    });
    // O1 à (300, 470) = ~395px du panier — drive possible
    const actions = evaluateOffensiveOptions(off, defPos, 'O1', HOOP);
    expect(actions.some((a) => a.type === 'drive')).toBe(true);
  });

  it("n'inclut PAS de drive si le porteur est déjà au rim", () => {
    const offRim: AttackerPositions = { ...off, O1: { x: 300, y: 100 } }; // à 25px du panier
    const defPos = makeDefPos({
      D1: { x: 0, y: 0 }, D2: { x: 0, y: 0 }, D3: { x: 0, y: 0 },
      D4: { x: 0, y: 0 }, D5: { x: 0, y: 0 },
    });
    const actions = evaluateOffensiveOptions(offRim, defPos, 'O1', HOOP);
    expect(actions.some((a) => a.type === 'drive')).toBe(false);
  });

  it('passe vers le meilleur shooter (O5 sous le panier ouvert) > tir loin contesté', () => {
    // O1 (deep) contesté par D1 légèrement à côté (laisse la passe ouverte
    // vers O5), pas sur la ligne de passe. O5 ouvert.
    const defPos = makeDefPos({
      D1: { x: 230, y: 470 },  // proche de O1 (contest tir) mais hors ligne O1→O5
      D2: { x: 0, y: 0 }, D3: { x: 0, y: 0 },
      D4: { x: 0, y: 0 }, D5: { x: 100, y: 0 }, // loin de O5
    });
    const actions = evaluateOffensiveOptions(off, defPos, 'O1', HOOP);
    const best = bestOffensiveAction(actions);
    expect(best).not.toBeNull();
    expect(best!.type).toBe('pass-shoot');
    expect(best!.targetId).toBe('O5');
  });

  it('actions triées par EV décroissant', () => {
    const defPos = makeDefPos({
      D1: { x: 0, y: 0 }, D2: { x: 0, y: 0 }, D3: { x: 0, y: 0 },
      D4: { x: 0, y: 0 }, D5: { x: 0, y: 0 },
    });
    const actions = evaluateOffensiveOptions(off, defPos, 'O1', HOOP);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i - 1].expectedPoints).toBeGreaterThanOrEqual(actions[i].expectedPoints);
    }
  });
});
