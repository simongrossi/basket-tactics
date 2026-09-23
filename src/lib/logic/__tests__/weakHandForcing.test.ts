// Main forte fonctionnelle — consigne « main faible » : le défenseur du
// porteur se décale du côté de sa main forte pour le forcer sur sa main
// faible. « Droite » = droite du porteur quand il fait face au panier attaqué.

import { describe, expect, it } from 'vitest';
import { HOOP, HOOP_OPPOSITE } from '@/lib/data/court';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { carrierDefenderTarget } from '../manDefense';
import { effectiveDefensePositions } from '../engine';
import { resolveTimelineFrame } from '../playback/frameResolver';

const att = { x: 300, y: 470 };

describe('consigne « main faible »', () => {
  it('droitier face au panier du haut : défenseur décalé vers sa droite', () => {
    const neutral = carrierDefenderTarget('coller', att, 40, HOOP)!;
    const right = carrierDefenderTarget('main-faible', att, 40, HOOP, 'right')!;
    expect(right.x - neutral.x).toBeGreaterThan(10);
    expect(right.y).toBeCloseTo(neutral.y, 6);
  });

  it('gaucher : décalé de l’autre côté', () => {
    const neutral = carrierDefenderTarget('coller', att, 40, HOOP)!;
    const left = carrierDefenderTarget('main-faible', att, 40, HOOP, 'left')!;
    expect(neutral.x - left.x).toBeGreaterThan(10);
  });

  it('sens d’attaque inversé : la droite du porteur change de côté à l’écran', () => {
    const attDown = { x: 300, y: 700 };
    const neutral = carrierDefenderTarget('coller', attDown, 40, HOOP_OPPOSITE)!;
    const right = carrierDefenderTarget('main-faible', attDown, 40, HOOP_OPPOSITE, 'right')!;
    expect(neutral.x - right.x).toBeGreaterThan(10);
  });

  it('main par défaut = droitier ; les autres consignes ignorent la main', () => {
    expect(carrierDefenderTarget('main-faible', att, 40, HOOP))
      .toEqual(carrierDefenderTarget('main-faible', att, 40, HOOP, 'right'));
    expect(carrierDefenderTarget('coller', att, 40, HOOP, 'left'))
      .toEqual(carrierDefenderTarget('coller', att, 40, HOOP, 'right'));
  });

  it('moteur complet : D1 en « main faible » se place selon la main de O1, en étape comme en lecture', () => {
    const base = makeInitialState();
    const withHand = (hand: 'right' | 'left'): AppState => ({
      ...base,
      attackerHands: { O1: hand, O2: 'right', O3: 'right', O4: 'right', O5: 'right' },
      rules: { ...base.rules, D1: { ...base.rules.D1, vsCarrier: 'main-faible' } },
      steps: [structuredClone(base.steps[0]), structuredClone(base.steps[0])],
    });
    const right = effectiveDefensePositions(withHand('right'), 1).D1;
    const left = effectiveDefensePositions(withHand('left'), 1).D1;
    expect(right.x - left.x).toBeGreaterThan(15);
    // La lecture (suivi par frame) garde le même côté que l'étape.
    const mid = resolveTimelineFrame(withHand('right'), 0.5)!.defPos.D1;
    expect(mid.x).toBeGreaterThan(left.x);
  });
});
