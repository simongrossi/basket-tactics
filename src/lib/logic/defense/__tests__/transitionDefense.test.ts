// Repli défensif en transition : arrêter le ballon, protéger le panier,
// premier attaquant disponible.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { HOOP_OPPOSITE } from '@/lib/data/court';
import { computeDefenseTargets } from '@/lib/logic/engine';
import { distance } from '@/lib/logic/geometry';
import { addFastBreakSteps } from '@/lib/state/transforms/stepTransforms';
import type { AppState, AttackerPositions, DefenderPositions, Matchups } from '@/lib/types';
import { defenseOutnumbered, planTransitionDefense, transitionNumbers } from '../transitionDefense';
import { applyRotationSwap, swapsFromMatchups } from '../rotationMemory';

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
      ...s0, playerCount: 5, activeStep: 0, realismProfile: 'realistic', secondsPerStep: 4, // timing de référence du scénario
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

describe('repli en transition — phase 2 : retour aux bons duels', () => {
  function breakThen(extra: Array<{ off: AttackerPositions; ballCarrier: 'O1' | 'O2' | 'O3' | 'O4' | 'O5' }>): AppState {
    const s0 = makeInitialState();
    const o: AttackerPositions = {
      O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
      O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
    };
    const d: DefenderPositions = {
      D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
      D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
    };
    const st = addFastBreakSteps({
      ...s0, playerCount: 5, activeStep: 0, realismProfile: 'realistic', secondsPerStep: 4,
      steps: [{ off: o, ballCarrier: 'O1', annotations: [], defenseOverrides: d, rebounder: 'D3', reboundType: 'defensive' }],
    }, { sourceStepIdx: 0 });
    return { ...st, steps: [...st.steps, ...extra.map((e) => ({ ...e, annotations: [] }))] };
  }

  it('les duels du repli tiennent tant que le ballon est près du panier (sans réglage)', () => {
    const base = breakThen([]);
    const sprint = base.steps[2];
    const st = breakThen([{ off: sprint.off, ballCarrier: sprint.ballCarrier as 'O4' }]);
    expect(st.rotationMemory).toBeUndefined();
    const a = computeDefenseTargets(st, 2).matchupsApplied;
    const b = computeDefenseTargets(st, 3).matchupsApplied;
    expect(b).toEqual(a);
    // Et ce ne sont pas les duels d'origine (cross-matching).
    expect(b).not.toEqual({ D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' });
  });

  it('retour par paires : une fois la défense revenue, deux défenseurs se rendent leurs hommes quand ces attaquants se rapprochent', () => {
    const settled: AttackerPositions = {
      O4: { x: 300, y: 710 }, O2: { x: 110, y: 800 }, O5: { x: 490, y: 800 },
      O1: { x: 230, y: 950 }, O3: { x: 370, y: 950 },
    };
    // Assez d'étapes pour que tout le monde soit revenu (fin du repli).
    const waiting = Array.from({ length: 10 }, () => ({ off: settled, ballCarrier: 'O4' as const }));
    const near: AttackerPositions = { ...settled, O1: { x: 370, y: 720 } };
    const st = breakThen([...waiting, { off: near, ballCarrier: 'O4' }, { off: near, ballCarrier: 'O4' }]);
    const last = st.steps.length - 1;
    const before = computeDefenseTargets(st, last - 2);
    expect(before.transitionPhase).toBeUndefined();
    // Cross-matching encore en place : D1 garde O4, D5 garde O1.
    expect(before.matchupsApplied.D1).toBe('O4');
    expect(before.matchupsApplied.D5).toBe('O1');
    const after = computeDefenseTargets(st, last);
    // D1 reprend O1, D5 prend O4.
    expect(after.matchupsApplied.D1).toBe('O1');
    expect(after.matchupsApplied.D5).toBe('O4');
    expect(new Set(Object.values(after.matchupsApplied)).size).toBe(5);
    // Les autres duels du repli tiennent (leurs attaquants sont éloignés).
    expect(after.rotationSwaps!.length).toBeGreaterThan(0);
  });

  it('pas de retour tant qu’un drive est en cours ou que le ballon est près du panier', () => {
    const settled: AttackerPositions = {
      O4: { x: 300, y: 850 }, O2: { x: 110, y: 800 }, O5: { x: 490, y: 800 },
      O1: { x: 360, y: 870 }, O3: { x: 370, y: 950 },
    };
    const base = breakThen([]);
    const sprint = base.steps[2];
    const st = breakThen([
      { off: sprint.off, ballCarrier: 'O4' },
      { off: settled, ballCarrier: 'O4' },
    ]);
    expect(computeDefenseTargets(st, 4).matchupsApplied.D1).toBe('O4');
  });

  it('décomposition en échanges : rejouée, elle redonne les duels du repli', () => {
    const baseM: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };
    const target: Matchups = { D1: 'O4', D2: 'O3', D3: 'O5', D4: 'O2', D5: 'O1' };
    const swaps = swapsFromMatchups(baseM, target, 2);
    const replay = { ...baseM };
    swaps.forEach((sw) => applyRotationSwap(replay, sw));
    expect(replay).toEqual(target);
    expect(swaps.every((sw) => sw.kind === 'transition')).toBe(true);
  });
});

describe('repli en transition — infériorité numérique', () => {
  const ids = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
  const planFor = (o: AttackerPositions, carrier: 'O1' | 'O2' | 'O3' | 'O4' | 'O5', start: DefenderPositions) =>
    planTransitionDefense({
      off: o, ballCarrier: carrier, hoop, defenderIds: [...ids], startPos: start,
      baseMatchups: base, defenseDistance: 45,
    });

  describe('2 contre 1', () => {
    // O1 conduit au milieu, O2 à l'aile gauche ; seul D1 est revenu.
    const o: AttackerPositions = {
      O1: { x: 300, y: 700 }, O2: { x: 150, y: 760 }, O3: { x: 450, y: 450 },
      O4: { x: 300, y: 400 }, O5: { x: 200, y: 380 },
    };
    const start: DefenderPositions = {
      D1: { x: 300, y: 900 }, D2: { x: 200, y: 560 }, D3: { x: 400, y: 520 },
      D4: { x: 300, y: 480 }, D5: { x: 250, y: 420 },
    };

    it('le défenseur revenu ne choisit pas : il recule devant le cercle, décalé vers l’autre attaquant', () => {
      const p = planFor(o, 'O1', start);
      expect(p.roles.D1).toBe('feint-retreat');
      // Nettement plus près du cercle que le porteur, sans monter sur lui.
      expect(distance(p.targets.D1, hoop)).toBeLessThan(distance(o.O1, hoop) - 100);
      expect(distance(p.targets.D1, o.O1)).toBeGreaterThan(100);
      // Décalé du côté de O2 (gauche) par rapport à l'axe porteur → panier.
      expect(p.targets.D1.x).toBeLessThan(300);
    });

    it('retardataires : le premier revenu prend l’attaquant libre le plus dangereux', () => {
      const p = planFor(o, 'O1', start);
      // D2 est le retardataire le plus avancé ; O2 est l'attaquant libre le
      // plus près du panier.
      expect(p.matchups.D2).toBe('O2');
      expect(p.roles.D2).toBe('match');
    });
  });

  describe('3 contre 2 en tandem', () => {
    const o: AttackerPositions = {
      O1: { x: 300, y: 700 }, O2: { x: 120, y: 800 }, O3: { x: 480, y: 800 },
      O4: { x: 300, y: 450 }, O5: { x: 220, y: 400 },
    };
    // D1 en haut du tandem, D2 en bas ; les autres en retard.
    const start: DefenderPositions = {
      D1: { x: 300, y: 840 }, D2: { x: 300, y: 950 }, D3: { x: 400, y: 520 },
      D4: { x: 300, y: 480 }, D5: { x: 250, y: 420 },
    };

    it('ballon dans l’axe : le haut arrête le ballon, le bas garde le cercle', () => {
      const p = planFor(o, 'O1', start);
      expect(p.roles.D1).toBe('stop-ball');
      expect(p.matchups.D1).toBe('O1');
      expect(p.roles.D2).toBe('protect-rim');
      expect(distance(p.targets.D2, hoop)).toBeLessThan(70);
    });

    it('passe à l’aile : le bas sort sur la passe, le haut descend au cercle (on tourne)', () => {
      const p = planFor(o, 'O3', start);
      expect(p.roles.D2).toBe('stop-ball');
      expect(p.matchups.D2).toBe('O3');
      expect(p.roles.D1).toBe('tandem-drop');
      expect(distance(p.targets.D1, hoop)).toBeLessThan(70);
    });

    it('retardataires : dans l’ordre d’arrivée, sur les attaquants libres les plus dangereux', () => {
      const p = planFor(o, 'O1', start);
      // D3 (le plus avancé des retardataires) prend une aile (les plus près du panier).
      expect(['O2', 'O3']).toContain(p.matchups.D3);
      expect(new Set(Object.values(p.matchups)).size).toBe(5);
    });
  });

  it('comptage : défenseurs revenus devant le ballon et attaquants dans le jeu', () => {
    const o: AttackerPositions = {
      O1: { x: 300, y: 700 }, O2: { x: 150, y: 760 }, O3: { x: 450, y: 450 },
      O4: { x: 300, y: 400 }, O5: { x: 200, y: 380 },
    };
    const start: DefenderPositions = {
      D1: { x: 300, y: 900 }, D2: { x: 200, y: 560 }, D3: { x: 400, y: 520 },
      D4: { x: 300, y: 480 }, D5: { x: 250, y: 420 },
    };
    const n = transitionNumbers({ off: o, ballCarrier: 'O1', hoop, defenderIds: [...ids], startPos: start });
    expect(n.back).toEqual(['D1']);
    expect(n.inPlay.sort()).toEqual(['O1', 'O2']);
    expect(defenseOutnumbered({ off: o, ballCarrier: 'O1', hoop, defenderIds: [...ids], startPos: start })).toBe(true);
  });
});

describe('repli en transition — poursuite tant que la défense est en retard', () => {
  function breakAndHalfCourt(extraSteps: number): AppState {
    const s0 = makeInitialState();
    const o: AttackerPositions = {
      O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
      O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
    };
    const d: DefenderPositions = {
      D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
      D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
    };
    const st = addFastBreakSteps({
      ...s0, playerCount: 5, activeStep: 0, realismProfile: 'realistic', secondsPerStep: 4,
      steps: [{ off: o, ballCarrier: 'O1', annotations: [], defenseOverrides: d, rebounder: 'D3', reboundType: 'defensive' }],
    }, { sourceStepIdx: 0 });
    const settled: AttackerPositions = {
      O4: { x: 300, y: 720 }, O2: { x: 110, y: 800 }, O5: { x: 490, y: 800 },
      O1: { x: 230, y: 950 }, O3: { x: 370, y: 950 },
    };
    const more = Array.from({ length: extraSteps }, () => ({ off: settled, ballCarrier: 'O4' as const, annotations: [] }));
    return { ...st, steps: [...st.steps, ...more] };
  }

  it('l’étape suivant le sprint reste en repli tant que la défense est en infériorité', () => {
    const st = breakAndHalfCourt(1);
    expect(computeDefenseTargets(st, 3).transitionPhase).toBe(true);
  });

  it('dès que tout le monde est revenu, le moteur normal reprend (et ne repasse pas en repli)', () => {
    const st = breakAndHalfCourt(10);
    const phases = st.steps.map((_, i) => !!computeDefenseTargets(st, i).transitionPhase);
    const firstNormal = phases.findIndex((p, i) => i > 2 && !p);
    expect(firstNormal).toBeGreaterThan(2);
    expect(phases.slice(firstNormal).every((p) => !p)).toBe(true);
  });

  it('sans fast-break, jamais de repli', () => {
    const st: AppState = { ...makeInitialState() };
    st.steps.forEach((_, i) => expect(computeDefenseTargets(st, i).transitionPhase).toBeUndefined());
  });
});
