import { describe, it, expect } from 'vitest';
import {
  isReplacementTrigger, replacementCutterId,
  pickFiller, computeReplacementChain, applyReplacementToStep,
} from '@/lib/logic/autoOffense/autoReplacement';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { distance } from '@/lib/logic/geometry';
import type { AttackerId, AttackerPositions, OffensiveScriptedAction, Step } from '@/lib/types';

function off(type: string, params: Record<string, unknown>): OffensiveScriptedAction {
  return { kind: 'offensive', id: 'a', type: type as OffensiveScriptedAction['type'], params } as OffensiveScriptedAction;
}

describe('isReplacementTrigger', () => {
  it('vrai pour les cuts + give-and-go + drive', () => {
    for (const t of ['basket-cut', 'backdoor-cut', 'flash-cut', 'give-and-go', 'drive']) {
      expect(isReplacementTrigger(t)).toBe(true);
    }
  });
  it('faux pour les autres', () => {
    for (const t of ['pass', 'pick-and-roll', 'shoot', 'drift']) {
      expect(isReplacementTrigger(t)).toBe(false);
    }
  });
});

describe('replacementCutterId', () => {
  it('cuts → params.cutter', () => {
    expect(replacementCutterId(off('basket-cut', { cutter: 'O3' }))).toBe('O3');
  });
  it('give-and-go → params.giver', () => {
    expect(replacementCutterId(off('give-and-go', { giver: 'O2' }))).toBe('O2');
  });
  it('drive → params.driver', () => {
    expect(replacementCutterId(off('drive', { driver: 'O1' }))).toBe('O1');
  });
  it('absent → null', () => {
    expect(replacementCutterId(off('basket-cut', {}))).toBeNull();
  });
});

const ACTIVE: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];

describe('pickFiller', () => {
  const prevOff: AttackerPositions = {
    O1: { x: 300, y: 250 }, // top (carrier)
    O2: { x: 480, y: 200 }, // wing droit (cutter)
    O3: { x: 500, y: 320 }, // droite, plus loin du panier → filler
    O4: { x: 120, y: 200 }, // gauche
    O5: { x: 150, y: 320 }, // gauche
  };
  it('choisit le coéquipier même côté + plus loin du panier, le plus proche', () => {
    const f = pickFiller(prevOff, prevOff.O2, new Set<AttackerId>(['O2', 'O1']), ACTIVE);
    expect(f).toBe('O3');
  });
  it('exclut les joueurs de excluded', () => {
    const f = pickFiller(prevOff, prevOff.O2, new Set<AttackerId>(['O2', 'O1', 'O3']), ACTIVE);
    expect(f).toBeNull();
  });
  it('null si personne plus loin du panier (cut depuis le fond)', () => {
    const f = pickFiller(prevOff, { x: 520, y: 400 }, new Set<AttackerId>(['O2', 'O1']), ACTIVE);
    expect(f).toBeNull();
  });
});

describe('computeReplacementChain', () => {
  const prevOff: AttackerPositions = {
    O1: { x: 300, y: 250 },
    O2: { x: 480, y: 200 }, // cutter
    O3: { x: 500, y: 320 }, // fill 1
    O4: { x: 510, y: 430 }, // droite encore plus loin → fill 2 (cascade)
    O5: { x: 150, y: 320 },
  };
  it('cascade profondeur 2 : O3 comble O2, O4 comble O3', () => {
    const chain = computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 2);
    expect(chain.map((r) => r.player)).toEqual(['O3', 'O4']);
    expect(chain[0].target).toEqual(prevOff.O2);
    expect(chain[1].target).toEqual(prevOff.O3);
  });
  it('profondeur 1 → un seul maillon', () => {
    const chain = computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 1);
    expect(chain).toHaveLength(1);
    expect(chain[0].player).toBe('O3');
  });
  it('le porteur ne comble jamais', () => {
    const chain = computeReplacementChain(prevOff, 'O2', 'O3', ACTIVE, 4);
    expect(chain.every((r) => r.player !== 'O3')).toBe(true);
  });
  it('clamp profondeur (99 → max 4, 0 → min 1)', () => {
    expect(computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 99).length).toBeLessThanOrEqual(4);
    expect(computeReplacementChain(prevOff, 'O2', 'O1', ACTIVE, 0).length).toBeGreaterThanOrEqual(1);
  });
  it('cutter introuvable → []', () => {
    const chain = computeReplacementChain(prevOff, 'O9' as AttackerId, 'O1', ACTIVE, 2);
    expect(chain).toEqual([]);
  });
});

function step(positions: AttackerPositions): Step {
  return { off: positions, ballCarrier: 'O1', annotations: [] };
}

describe('applyReplacementToStep', () => {
  it('fusionne les positions des fillers', () => {
    const s = step({
      O1: { x: 300, y: 250 }, O2: { x: 480, y: 80 }, O3: { x: 500, y: 320 },
      O4: { x: 120, y: 200 }, O5: { x: 150, y: 320 },
    });
    const out = applyReplacementToStep(s, [{ player: 'O3', target: { x: 480, y: 200 } }]);
    expect(out.off.O3.x).toBeGreaterThan(450);
    expect(out.off.O3.y).toBeLessThan(320);
    expect(out.off.O1).toEqual(s.off.O1);
  });

  it('respecte la clearance entre fillers placés au même endroit', () => {
    const s = step({
      O1: { x: 300, y: 250 }, O2: { x: 50, y: 50 }, O3: { x: 60, y: 60 },
      O4: { x: 120, y: 200 }, O5: { x: 150, y: 320 },
    });
    const target = { x: 480, y: 200 };
    const out = applyReplacementToStep(s, [
      { player: 'O2', target }, { player: 'O3', target },
    ]);
    expect(distance(out.off.O2, out.off.O3)).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.01);
  });

  it('relocations vide → step inchangé (même référence)', () => {
    const s = step({
      O1: { x: 1, y: 1 }, O2: { x: 2, y: 2 }, O3: { x: 3, y: 3 },
      O4: { x: 4, y: 4 }, O5: { x: 5, y: 5 },
    });
    expect(applyReplacementToStep(s, [])).toBe(s);
  });
});
