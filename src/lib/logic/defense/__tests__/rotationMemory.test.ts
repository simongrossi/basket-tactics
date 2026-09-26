// P4.4 — Mémoire de rotation : un défenseur en rotation termine sa rotation
// au lieu de repartir à froid à l'étape suivante.

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { findTemplate } from '@/lib/data/templates';
import { computeDefenseTargets, effectiveDefensePositions, getDefenseHoop } from '@/lib/logic/engine';
import { distance } from '@/lib/logic/geometry';
import type { AppState, AttackerPositions, Matchups, RotationMemoryMode, Step } from '@/lib/types';
import {
  carryRotationSwaps,
  decideRotationSwap,
  isCalmForScramble,
  shouldTaggerStay,
  type RotationSwap,
} from '../rotationMemory';

/** « PNR central » : O5 pose l'écran, O1 attaque, O5 roule. D4 tag à
 *  l'étape 2 ; à l'étape 3 l'écran n'est plus lu, roller à 105 px du panier. */
function pnrCentral(mode?: RotationMemoryMode, extraSteps: Step[] = []): AppState {
  const tpl = findTemplate('pnr-central')!;
  return {
    ...makeInitialState(),
    steps: [...structuredClone(tpl.steps), ...extraSteps],
    defenseInitial: structuredClone(tpl.defenseInitial),
    screenRule: 'hedge',
    activeStep: 0,
    rotationMemory: mode,
  };
}

/** Étape ajoutée après le roll : `off` + porteur. */
function stepAfterRoll(off: Partial<AttackerPositions>, ballCarrier: Step['ballCarrier'] = 'O1'): Step {
  const roll = findTemplate('pnr-central')!.steps[3].off;
  return { off: { ...roll, ...off } as AttackerPositions, ballCarrier, annotations: [] };
}

describe('P4.4 mémoire de rotation — PNR central', () => {
  it('sans réglage : comportement historique, le tagueur repart sur son homme', () => {
    const res = computeDefenseTargets(pnrCentral(), 3);
    expect(res.positions.D4.matchedTo).toBe('O4');
    expect(res.positions.D4.rotation).toBeUndefined();
    expect(res.rotationSwaps).toBeUndefined();
  });

  it('le tag est bien observé à l’étape 2', () => {
    const res = computeDefenseTargets(pnrCentral('auto'), 2);
    expect(res.positions.D4.pnrRole).toBe('tag');
    expect(res.positions.D4.rotationOn).toBe('O5');
    expect(res.pnrTag).toEqual({ tagger: 'D4', roller: 'O5', bigDef: 'D5', orphan: 'O4' });
  });

  it('auto : le tagueur, plus proche, garde le roller ; le big prend l’homme laissé', () => {
    const res = computeDefenseTargets(pnrCentral('auto'), 3);
    expect(res.positions.D4.matchedTo).toBe('O5');
    expect(res.positions.D4.rotation).toBe('stay');
    expect(res.positions.D5.matchedTo).toBe('O4');
    expect(res.positions.D5.rotation).toBe('help-the-helper');
    expect(res.rotationSwaps).toHaveLength(1);
  });

  it('auto : le roller n’est plus laissé seul en lecture réelle', () => {
    const state = pnrCentral('auto');
    const roller = state.steps[3].off.O5;
    const before = effectiveDefensePositions(pnrCentral(), 3);
    const after = effectiveDefensePositions(state, 3);
    const closest = (def: typeof after) =>
      Math.min(...(['D1', 'D2', 'D3', 'D4', 'D5'] as const).map((d) => distance(def[d], roller)));
    expect(closest(after)).toBeLessThan(closest(before));
    expect(distance(after.D4, roller)).toBeLessThanOrEqual(40);
  });

  it('recover : le tagueur rend le roller et revient à mi-chemin, sans repartir d’un coup', () => {
    const state = pnrCentral('recover');
    const legacy = computeDefenseTargets(pnrCentral(), 3).positions.D4;
    const prevTag = computeDefenseTargets(state, 2).positions.D4;
    const res = computeDefenseTargets(state, 3);
    const d4 = res.positions.D4;
    expect(d4.matchedTo).toBe('O4');
    expect(d4.rotation).toBe('recover');
    expect(d4.x).toBeCloseTo((prevTag.x + legacy.x) / 2, 5);
    expect(d4.y).toBeCloseTo((prevTag.y + legacy.y) / 2, 5);
    expect(res.rotationSwaps).toBeUndefined();
  });

  it('le X-out termine aussi sa rotation progressivement', () => {
    const res = computeDefenseTargets(pnrCentral('auto'), 3);
    expect(res.positions.D2.rotation).toBe('recover');
    expect(res.positions.D2.matchedTo).toBe('O2');
  });

  it('stay : le tagueur garde le roller', () => {
    const res = computeDefenseTargets(pnrCentral('stay'), 3);
    expect(res.positions.D4.matchedTo).toBe('O5');
    expect(res.positions.D5.matchedTo).toBe('O4');
  });

  it('les duels échangés tiennent tant que le jeu n’est pas calmé (drive)', () => {
    const state = pnrCentral('auto', [stepAfterRoll({ O1: { x: 330, y: 220 } })]);
    const res = computeDefenseTargets(state, 4);
    expect(res.positions.D4.matchedTo).toBe('O5');
    expect(res.positions.D5.matchedTo).toBe('O4');
    expect(res.rotationSwaps).toHaveLength(1);
  });

  it('retour au calme : ballon ressorti, chacun reprend son homme', () => {
    const state = pnrCentral('auto', [stepAfterRoll({ O1: { x: 300, y: 400 } })]);
    const res = computeDefenseTargets(state, 4);
    expect(res.positions.D4.matchedTo).toBe('O4');
    expect(res.positions.D5.matchedTo).toBe('O5');
    expect(res.positions.D4.rotation).toBe('scramble-back');
    expect(res.positions.D5.rotation).toBe('scramble-back');
    expect(res.rotationSwaps).toBeUndefined();
  });

  it('pur et déterministe : deux appels donnent le même résultat', () => {
    const state = pnrCentral('auto', [stepAfterRoll({ O1: { x: 330, y: 220 } })]);
    expect(computeDefenseTargets(state, 4)).toEqual(computeDefenseTargets(state, 4));
  });

  it('n’écrit rien dans l’état', () => {
    const state = pnrCentral('auto');
    const snapshot = structuredClone(state);
    computeDefenseTargets(state, 3);
    expect(state).toEqual(snapshot);
  });
});

describe('P4.4 mémoire de rotation — fonctions pures', () => {
  const hoop = getDefenseHoop(makeInitialState());
  const tag = { tagger: 'D4', roller: 'O5', bigDef: 'D5', orphan: 'O4' } as const;
  const off = { O5: { x: hoop.x, y: hoop.y + 120 } } as AttackerPositions;

  it('auto : le big plus proche garde le roller → pas d’échange', () => {
    const prevPositions = {
      D4: { x: hoop.x + 150, y: hoop.y + 150 },
      D5: { x: hoop.x, y: hoop.y + 160 },
    } as never;
    expect(shouldTaggerStay('auto', tag, { off, hoop, prevPositions })).toBe(false);
    expect(shouldTaggerStay('stay', tag, { off, hoop, prevPositions })).toBe(true);
    expect(shouldTaggerStay('recover', tag, { off, hoop, prevPositions })).toBe(false);
  });

  it('auto : roller ressorti loin du cercle → pas d’échange', () => {
    const farOff = { O5: { x: hoop.x, y: hoop.y + 300 } } as AttackerPositions;
    const prevPositions = {
      D4: { x: hoop.x, y: hoop.y + 280 },
      D5: { x: hoop.x + 200, y: hoop.y + 400 },
    } as never;
    expect(shouldTaggerStay('auto', tag, { off: farOff, hoop, prevPositions })).toBe(false);
  });

  it('pas de nouvel échange si l’écran continue sur le même roller', () => {
    const matchups = { D4: 'O4', D5: 'O5' } as Matchups;
    const swap = decideRotationSwap('stay', tag, matchups, {
      stepIdx: 3, off, hoop, prevPositions: {} as never,
      busyDefenders: new Set(), currentScreener: 'O5',
    });
    expect(swap).toBeNull();
  });

  it('pas de nouvel échange si un des deux défenseurs est pris ailleurs', () => {
    const matchups = { D4: 'O4', D5: 'O5' } as Matchups;
    const swap = decideRotationSwap('stay', tag, matchups, {
      stepIdx: 3, off, hoop, prevPositions: {} as never,
      busyDefenders: new Set(['D5'] as const),
    });
    expect(swap).toBeNull();
  });

  it('un échange est abandonné si un switch a changé les duels entre-temps', () => {
    const swap: RotationSwap = { ...tag, since: 2 };
    const matchups = { D4: 'O2', D5: 'O5', D2: 'O4' } as Matchups;
    const { kept, scrambled } = carryRotationSwaps([swap], matchups, {
      carrierPos: { x: hoop.x, y: hoop.y + 150 }, hoop, triggerActive: true, prevPositions: {} as never,
    });
    expect(kept).toHaveLength(0);
    expect(scrambled).toHaveLength(0);
    expect(matchups.D4).toBe('O2');
  });

  it('retour au calme : il faut ballon dehors, pas de trigger, défenseurs proches', () => {
    const base = {
      carrierPos: { x: hoop.x, y: hoop.y + 320 },
      hoop,
      triggerActive: false,
      taggerPos: { x: hoop.x, y: hoop.y + 80 },
      bigDefPos: { x: hoop.x + 90, y: hoop.y + 100 },
    };
    expect(isCalmForScramble(base)).toBe(true);
    expect(isCalmForScramble({ ...base, triggerActive: true })).toBe(false);
    expect(isCalmForScramble({ ...base, carrierPos: { x: hoop.x, y: hoop.y + 150 } })).toBe(false);
    expect(isCalmForScramble({ ...base, bigDefPos: { x: hoop.x + 250, y: hoop.y + 200 } })).toBe(false);
  });
});
