// Repli défensif en transition : arrêter le ballon, protéger le panier,
// premier attaquant disponible.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { HOOP_OPPOSITE } from '@/lib/data/court';
import { computeDefenseTargets } from '@/lib/logic/engine';
import { distance } from '@/lib/logic/geometry';
import { addFastBreakSteps } from '@/lib/state/transforms/stepTransforms';
import type { AppState, AttackerPositions, DefenderPositions, Matchups } from '@/lib/types';
import { planTransitionDefense } from '../transitionDefense';

const hoop = HOOP_OPPOSITE; // la défense protège le panier bas
const base: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };

// Break vers le bas : porteur O1 au milieu, ailes O2 / O3, trailers O4 / O5.
const off: AttackerPositions = {
  O1: { x: 300, y: 700 },
  O2: { x: 110, y: 820 },
  O3: { x: 490, y: 820 },
  O4: { x: 300, y: 560 },
  O5: { x: 250, y: 480 },
};

function plan(startPos: DefenderPositions, ballCarrier: keyof typeof off = 'O1') {
  return planTransitionDefense({
    off, ballCarrier, hoop, defenderIds: ['D1', 'D2', 'D3', 'D4', 'D5'], startPos,
    baseMatchups: base, defenseDistance: 45,
  });
}

describe('repli en transition — priorités', () => {
  // D3 et D2 déjà revenus devant le ballon, les autres derrière.
  const start: DefenderPositions = {
    D1: { x: 300, y: 500 },
    D2: { x: 200, y: 900 },
    D3: { x: 320, y: 780 },
    D4: { x: 380, y: 600 },
    D5: { x: 240, y: 420 },
  };

  it('1. le défenseur déjà devant le ballon l’arrête, quel que soit son homme', () => {
    const p = plan(start);
    expect(p.roles.D3).toBe('stop-ball');
    expect(p.matchups.D3).toBe('O1');
    // Placé entre le porteur et le panier.
    expect(distance(p.targets.D3, hoop)).toBeLessThan(distance(off.O1, hoop));
  });

  it('2. le suivant le plus proche du cercle file sous le panier', () => {
    const p = plan(start);
    expect(p.roles.D2).toBe('protect-rim');
    expect(distance(p.targets.D2, hoop)).toBeLessThan(70);
  });

  it('3. les autres prennent les attaquants les plus dangereux ; le trailer le plus loin reste au défenseur du cercle', () => {
    const p = plan(start);
    const matched = (['D1', 'D4', 'D5'] as const).map((d) => p.matchups[d]);
    // Les ailes (près du panier) sont prises.
    expect(matched).toContain('O2');
    expect(matched).toContain('O3');
    // O5, le plus loin du panier, n'est pas pris en individuelle.
    expect(matched).not.toContain('O5');
    expect(p.matchups.D2).toBe('O5');
    // Tous les rôles sont posés, un seul stop-ballon et un seul cercle.
    const roles = Object.values(p.roles);
    expect(roles.filter((r) => r === 'stop-ball')).toHaveLength(1);
    expect(roles.filter((r) => r === 'protect-rim')).toHaveLength(1);
  });

  it('cross-matching : on prend le premier attaquant disponible, pas son homme', () => {
    const p = plan(start);
    // D3 n'est pas sur O3 : il arrête le ballon.
    expect(p.matchups.D3).not.toBe('O3');
  });

  it('personne devant le ballon : le plus proche du point d’arrêt s’y colle', () => {
    const allBehind: DefenderPositions = {
      D1: { x: 300, y: 600 }, D2: { x: 150, y: 500 }, D3: { x: 450, y: 500 },
      D4: { x: 300, y: 450 }, D5: { x: 250, y: 400 },
    };
    const p = plan(allBehind);
    expect(p.roles.D1).toBe('stop-ball');
  });

  it('effectif réduit (3 contre 3) : ballon, panier, un attaquant', () => {
    const p = planTransitionDefense({
      off: { O1: off.O1, O2: off.O2, O3: off.O3 } as AttackerPositions,
      ballCarrier: 'O1', hoop, defenderIds: ['D1', 'D2', 'D3'],
      startPos: { D1: start.D1, D2: start.D2, D3: start.D3 } as DefenderPositions,
      baseMatchups: base, defenseDistance: 45,
    });
    expect(Object.values(p.roles).sort()).toEqual(['match', 'protect-rim', 'stop-ball']);
  });
});

describe('repli en transition — dans le fast-break', () => {
  function breakState(): AppState {
    const s0 = makeInitialState();
    const o: AttackerPositions = {
      O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
      O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
    };
    const d: DefenderPositions = {
      D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
      D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
    };
    const st: AppState = {
      ...s0, playerCount: 5, activeStep: 0, realismProfile: 'realistic',
      steps: [{ off: o, ballCarrier: 'O1', annotations: [], defenseOverrides: d, rebounder: 'D3', reboundType: 'defensive' }],
    };
    return addFastBreakSteps(st, { sourceStepIdx: 0 });
  }

  it('étape de sprint : un stop-ballon sur le porteur, un défenseur au cercle', () => {
    const st = breakState();
    const res = computeDefenseTargets(st, 2).positions;
    const carrier = st.steps[2].ballCarrier;
    const stopper = Object.values(res).filter((p) => p.transitionRole === 'stop-ball');
    expect(stopper).toHaveLength(1);
    expect(stopper[0].matchedTo).toBe(carrier);
    const rim = Object.values(res).filter((p) => p.transitionRole === 'protect-rim');
    expect(rim).toHaveLength(1);
    expect(distance(rim[0], HOOP_OPPOSITE)).toBeLessThan(70);
  });

  it('pur : deux appels identiques, état intact', () => {
    const st = breakState();
    const snapshot = structuredClone(st);
    expect(computeDefenseTargets(st, 2)).toEqual(computeDefenseTargets(st, 2));
    expect(st).toEqual(snapshot);
  });
});
