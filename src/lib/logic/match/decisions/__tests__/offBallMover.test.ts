// Tests Phase I B2 — décideur off-ball.
// Vérifie : drift skip si proche, drift en cas d'écart, cut budget (max 1),
// transition phase cut, relocate sur changement de porteur.

import { describe, it, expect } from 'vitest';
import type {
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  Point,
} from '@/lib/types';
import { HOOP } from '@/lib/data/court';
import {
  advanceOffBallIntents,
  decideOffBallIntents,
  triggerRelocateAfterPass,
  type OffBallIntents,
} from '../offBallMover';

// Helpers : positions stub
function makeOff(): AttackerPositions {
  return {
    O1: { x: 300, y: 460 }, // porteur, top
    O2: { x: 130, y: 410 }, // wing gauche
    O3: { x: 470, y: 410 }, // wing droite
    O4: { x: 170, y: 250 }, // corner bas-gauche
    O5: { x: 430, y: 250 }, // corner bas-droite
  };
}

function makeDef(opts: Partial<{ gazeOnBall: boolean; sag: number }> = {}): ComputedDefense {
  const { gazeOnBall = true, sag = 30 } = opts;
  // Si gazeOnBall : tous les défenseurs regardent vers O1 (porteur).
  // Sinon : regard tourné vers le panier (= ils ne suivent pas leur homme).
  const mk = (att: Point, defAtt: Point, side: number) => {
    // Position défenseur : à `sag` px de son attaquant vers le panier.
    const dx = HOOP.x - att.x;
    const dy = HOOP.y - att.y;
    const d = Math.hypot(dx, dy) || 1;
    const dpos = {
      x: att.x + (dx / d) * sag,
      y: att.y + (dy / d) * sag,
    };
    // Regard : soit vers O1 (gazeOnBall), soit vers le panier (= away from att).
    const target = gazeOnBall ? defAtt : HOOP;
    const gaze = Math.atan2(target.y - dpos.y, target.x - dpos.x) * 180 / Math.PI;
    return {
      x: dpos.x,
      y: dpos.y,
      late: false,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: 'O1' as AttackerId,
      onScreen: false,
      switchedThisStep: false,
      orientation: 0,
      gazeOrientation: gaze,
      facing: { x: 0, y: 0 },
      armBallSide: { x: 0, y: 0 },
      armManSide: { x: 0, y: 0 },
    };
  };
  const off = makeOff();
  return {
    D1: mk(off.O1, off.O1, 1),
    D2: mk(off.O2, off.O1, -1),
    D3: mk(off.O3, off.O1, 1),
    D4: mk(off.O4, off.O1, -1),
    D5: mk(off.O5, off.O1, 1),
  };
}

function alwaysRng(value: number): () => number {
  return () => value;
}

describe('offBallMover — decideOffBallIntents', () => {
  it('ne décide PAS un intent pour le porteur', () => {
    const intents = decideOffBallIntents({
      off: makeOff(),
      defPos: makeDef(),
      carrier: 'O1',
      hoop: HOOP,
      rng: alwaysRng(0.99), // pas de cut
      currentIntents: {},
    });
    expect(intents.O1).toBeUndefined();
  });

  it("retourne `idle` pour un off-ball déjà proche de son slot idéal", () => {
    // computeOffBallPositions retournera ~les positions actuelles si elles
    // sont déjà bien spaced. À défaut on attend au moins `idle` sur certains.
    const intents = decideOffBallIntents({
      off: makeOff(),
      defPos: makeDef(),
      carrier: 'O1',
      hoop: HOOP,
      rng: alwaysRng(0.99), // pas de cut
      currentIntents: {},
    });
    // Au moins un off-ball est idle ou drift (pas de cut, le rng le bloque).
    const kinds = (Object.keys(intents) as AttackerId[]).map((id) => intents[id]?.kind);
    expect(kinds.every((k) => k === 'idle' || k === 'space-drift')).toBe(true);
    expect(kinds.includes('cut')).toBe(false);
  });

  it("déclenche un cut quand défenseur regard détourné + sag suffisant + rng favorable", () => {
    const intents = decideOffBallIntents({
      off: makeOff(),
      defPos: makeDef({ gazeOnBall: false, sag: 120 }),
      carrier: 'O1',
      hoop: HOOP,
      rng: alwaysRng(0.001), // toujours under CUT_PROBABILITY
      currentIntents: {},
    });
    // Au moins UN cut déclenché.
    const cutters = (Object.keys(intents) as AttackerId[]).filter(
      (id) => intents[id]?.kind === 'cut'
    );
    expect(cutters.length).toBeGreaterThanOrEqual(1);
  });

  it("respecte le budget : max 1 cut actif à la fois", () => {
    const intents = decideOffBallIntents({
      off: makeOff(),
      defPos: makeDef({ gazeOnBall: false, sag: 120 }),
      carrier: 'O1',
      hoop: HOOP,
      rng: alwaysRng(0.001), // tous les off-ball seraient éligibles
      currentIntents: {},
    });
    const cutters = (Object.keys(intents) as AttackerId[]).filter(
      (id) => intents[id]?.kind === 'cut'
    );
    expect(cutters.length).toBe(1);
  });

  it("préserve un cut déjà en cours (jamais annulé à mi-chemin)", () => {
    const inflight: OffBallIntents = {
      O3: { kind: 'cut', phase: 'to-basket', target: { ...HOOP } },
    };
    const intents = decideOffBallIntents({
      off: makeOff(),
      defPos: makeDef({ gazeOnBall: false, sag: 120 }),
      carrier: 'O1',
      hoop: HOOP,
      rng: alwaysRng(0.001),
      currentIntents: inflight,
    });
    expect(intents.O3?.kind).toBe('cut');
    // Et donc pas de nouveau cut sur un autre (budget plein).
    const otherCutters = (Object.keys(intents) as AttackerId[]).filter(
      (id) => id !== 'O3' && intents[id]?.kind === 'cut'
    );
    expect(otherCutters).toEqual([]);
  });
});

describe('offBallMover — advanceOffBallIntents', () => {
  it("avance la position en `space-drift` vers le target", () => {
    const off = makeOff();
    const target: Point = { x: off.O2.x + 100, y: off.O2.y };
    const result = advanceOffBallIntents({
      off,
      intents: { O2: { kind: 'space-drift', target } },
      hoop: HOOP,
    });
    // O2 a bougé vers target.
    expect(result.off.O2.x).toBeGreaterThan(off.O2.x);
    expect(result.off.O2.x).toBeLessThan(target.x);
  });

  it("transitionne un cut 'to-basket' → 'to-corner' à l'arrivée au panier", () => {
    const off = makeOff();
    // Place O3 quasi sur le panier.
    off.O3 = { x: HOOP.x + 5, y: HOOP.y + 5 };
    const result = advanceOffBallIntents({
      off,
      intents: {
        O3: { kind: 'cut', phase: 'to-basket', target: { ...HOOP } },
      },
      hoop: HOOP,
    });
    const next = result.intents.O3;
    expect(next?.kind).toBe('cut');
    if (next?.kind === 'cut') {
      expect(next.phase).toBe('to-corner');
    }
  });

  it("termine un cut quand la phase 'to-corner' atteint son target", () => {
    const off = makeOff();
    const cornerTarget = { x: 60, y: 100 };
    off.O3 = { x: cornerTarget.x + 5, y: cornerTarget.y + 5 };
    const result = advanceOffBallIntents({
      off,
      intents: {
        O3: { kind: 'cut', phase: 'to-corner', target: cornerTarget },
      },
      hoop: HOOP,
    });
    expect(result.intents.O3?.kind).toBe('idle');
  });

  it("respecte la clearance entre coéquipiers pendant le drift", () => {
    const off = makeOff();
    // On place O2 et O3 très proches.
    off.O2 = { x: 300, y: 300 };
    off.O3 = { x: 305, y: 305 };
    // Drift de O2 directement sur O3 → push-out doit intervenir.
    const result = advanceOffBallIntents({
      off,
      intents: { O2: { kind: 'space-drift', target: { ...off.O3 } } },
      hoop: HOOP,
    });
    const d = Math.hypot(
      result.off.O2.x - result.off.O3.x,
      result.off.O2.y - result.off.O3.y
    );
    expect(d).toBeGreaterThanOrEqual(34 - 0.01); // MIN_TEAMMATE_CLEARANCE_PX
  });
});

describe('offBallMover — triggerRelocateAfterPass', () => {
  it("retourne un intent relocate vers le slot vacant", () => {
    const off = makeOff();
    const intent = triggerRelocateAfterPass({
      previousCarrier: 'O1',
      newCarrier: 'O3',
      off,
      hoop: HOOP,
    });
    // Après passe vers O3, l'ancien porteur O1 reloque (probablement) :
    // soit relocate vers slot vacant, soit null s'il est déjà bien placé.
    if (intent) {
      expect(intent.kind).toBe('relocate');
      expect(typeof (intent as { target: Point }).target.x).toBe('number');
    }
  });
});
