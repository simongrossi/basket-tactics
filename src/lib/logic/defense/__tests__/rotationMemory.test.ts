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
  decideCascadeSwap,
  decideNextCascade,
  decideRotationSwap,
  openManStillRunning,
  isCalmForScramble,
  shouldTaggerStay,
  tagRotationSwap,
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

  it('retour au calme : la chaîne (tag + cascade) se défait d’un bloc', () => {
    // Ballon ressorti, chacun revenu près de son homme d'origine.
    const state = passToOpenMan('auto', [stepAfterRoll({
      O1: { x: 300, y: 400 }, O2: { x: 180, y: 260 }, O4: { x: 250, y: 230 }, O5: { x: 200, y: 300 },
    })]);
    const res = computeDefenseTargets(state, 4);
    expect(res.positions.D2.matchedTo).toBe('O2');
    expect(res.positions.D4.matchedTo).toBe('O4');
    expect(res.positions.D5.matchedTo).toBe('O5');
    (['D2', 'D4', 'D5'] as const).forEach((d) => expect(res.positions[d].rotation).toBe('scramble-back'));
    expect(res.rotationSwaps).toBeUndefined();
  });

  it('ballon ressorti mais défenseurs encore loin de leur homme : la chaîne tient entière', () => {
    const state = passToOpenMan('auto', [stepAfterRoll({ O1: { x: 300, y: 400 } })]);
    const res = computeDefenseTargets(state, 4);
    expect(res.rotationSwaps).toHaveLength(2);
    expect(res.positions.D2.matchedTo).toBe('O4');
    expect(res.positions.D5.matchedTo).toBe('O2');
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

/** PNR central où, à l'étape 3, O1 passe à O4 (l'homme laissé libre par le
 *  tagueur D4, vers qui D2 a fait le X-out). */
function passToOpenMan(mode?: RotationMemoryMode, extraSteps: Step[] = []): AppState {
  const state = pnrCentral(mode, extraSteps);
  state.steps[3] = { ...state.steps[3], ballCarrier: 'O4', annotations: [] };
  return state;
}

describe('P4.4 rotation en cascade — passe sur l’homme laissé libre', () => {
  it('sans réglage : pas de cascade', () => {
    const res = computeDefenseTargets(passToOpenMan(), 3);
    expect(res.positions.D2.matchedTo).toBe('O2');
    expect(res.positions.D4.matchedTo).toBe('O4');
  });

  it('le X-out est observé à l’étape 2', () => {
    expect(computeDefenseTargets(passToOpenMan('auto'), 2).xOut)
      .toEqual({ xOutDef: 'D2', xOutMan: 'O2', orphan: 'O4' });
  });

  it('auto : le X-out fait le closeout, le big prend l’homme du X-out, le tagueur garde le roller', () => {
    const res = computeDefenseTargets(passToOpenMan('auto'), 3);
    expect(res.positions.D4.matchedTo).toBe('O5');
    expect(res.positions.D4.rotation).toBe('stay');
    expect(res.positions.D2.matchedTo).toBe('O4');
    expect(res.positions.D2.rotation).toBe('closeout');
    expect(res.positions.D5.matchedTo).toBe('O2');
    expect(res.positions.D5.rotation).toBe('rotate');
    // Tous les attaquants restent marqués par un défenseur distinct.
    const men = Object.values(res.positions).map((p) => p.matchedTo);
    expect(new Set(men).size).toBe(5);
  });

  it('les duels de la cascade tiennent à l’étape suivante tant que le jeu n’est pas calmé', () => {
    const state = passToOpenMan('auto', [stepAfterRoll({ O4: { x: 190, y: 160 } }, 'O4')]);
    const res = computeDefenseTargets(state, 4);
    expect(res.positions.D2.matchedTo).toBe('O4');
    expect(res.positions.D5.matchedTo).toBe('O2');
    expect(res.positions.D4.matchedTo).toBe('O5');
  });

  it('recover : pas d’échange durable, pas de cascade', () => {
    const res = computeDefenseTargets(passToOpenMan('recover'), 3);
    expect(res.positions.D2.matchedTo).toBe('O2');
    expect(res.positions.D4.matchedTo).toBe('O4');
    expect(res.rotationSwaps).toBeUndefined();
  });
});

/** Cascade à deux crans : pendant le roll O1 dérive à gauche ; passe à O4
 *  (1er closeout, D5 court vers O2), puis O4 renvoie à O2 (2e closeout). */
function twoLevelCascade(mode?: RotationMemoryMode): AppState {
  const state = passToOpenMan(mode);
  const roll = state.steps[3].off;
  state.steps[3] = { ...state.steps[3], off: { ...roll, O1: { x: 220, y: 390 } } };
  const off = state.steps[3].off;
  state.steps.push({ off, ballCarrier: 'O2', annotations: [] });
  state.steps.push({ off, ballCarrier: 'O1', annotations: [] });
  return { ...state, realismProfile: 'realistic' };
}

describe('P4.4 cascade à plusieurs crans', () => {
  it('1er cran : l’homme du X-out est signalé libre, son nouveau défenseur court', () => {
    const res = computeDefenseTargets(twoLevelCascade('auto'), 3);
    expect(res.openMan).toEqual({ man: 'O2', runner: 'D5', level: 1 });
  });

  it('2e cran : passe à l’homme libre avant l’arrivée du coureur → le plus proche sort', () => {
    const res = computeDefenseTargets(twoLevelCascade('auto'), 4);
    expect(res.positions.D1.matchedTo).toBe('O2');
    expect(res.positions.D1.rotation).toBe('closeout');
    expect(res.positions.D5.matchedTo).toBe('O1');
    expect(res.positions.D5.rotation).toBe('rotate');
    expect(res.openMan).toEqual({ man: 'O1', runner: 'D5', level: 2 });
    expect(new Set(Object.values(res.positions).map((p) => p.matchedTo)).size).toBe(5);
  });

  it('on ne lâche pas la raquette : pas de cran si seuls des défenseurs de joueurs au cercle sont plus proches', () => {
    // Sans la dérive d'O1, seuls D2 (O4 à 151 px du panier) et D4 (roller)
    // sont plus proches d'O2 que D5.
    const state = { ...passToOpenMan('auto'), realismProfile: 'realistic' as const };
    const off = state.steps[3].off;
    state.steps.push({ off, ballCarrier: 'O2', annotations: [] });
    const res = computeDefenseTargets(state, 4);
    expect(res.positions.D5.matchedTo).toBe('O2');
    expect(res.positions.D2.matchedTo).toBe('O4');
    // Le coureur est toujours en route : la cascade reste ouverte.
    expect(res.openMan).toEqual({ man: 'O2', runner: 'D5', level: 1 });
  });

  it('recover : aucune cascade', () => {
    const res = computeDefenseTargets(twoLevelCascade('recover'), 4);
    expect(res.positions.D1.matchedTo).toBe('O1');
    expect(res.openMan).toBeUndefined();
  });

  it('nombre de crans borné', () => {
    const next = decideNextCascade('auto', { man: 'O2', runner: 'D5', level: 3 }, { D5: 'O2', D1: 'O1' } as Matchups, {
      stepIdx: 5,
      off: { O1: { x: 200, y: 380 }, O2: { x: 130, y: 320 } } as AttackerPositions,
      hoop: getDefenseHoop(makeInitialState()),
      ballCarrier: 'O2',
      prevBallCarrier: 'O4',
      prevPositions: { D5: { x: 400, y: 200 }, D1: { x: 150, y: 330 } } as never,
      busyDefenders: new Set(),
    });
    expect(next).toBeNull();
  });

  it('coureur arrivé : la cascade se referme', () => {
    const open = { man: 'O2', runner: 'D5', level: 1 } as const;
    const off = { O2: { x: 130, y: 320 } } as AttackerPositions;
    expect(openManStillRunning(open, { D5: 'O2' } as Matchups, off, { D5: { x: 150, y: 300 } } as never)).toBe(false);
    expect(openManStillRunning(open, { D5: 'O2' } as Matchups, off, { D5: { x: 330, y: 250 } } as never)).toBe(true);
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
    const swap: RotationSwap = tagRotationSwap(tag, 2);
    const matchups = { D4: 'O2', D5: 'O5', D2: 'O4' } as Matchups;
    const { kept, scrambled } = carryRotationSwaps([swap], matchups, {
      off, carrierPos: { x: hoop.x, y: hoop.y + 150 }, hoop, triggerActive: true, prevPositions: {} as never,
    });
    expect(kept).toHaveLength(0);
    expect(scrambled).toHaveLength(0);
    expect(matchups.D4).toBe('O2');
  });

  it('retour au calme : ballon dehors, pas de trigger, chacun près de son homme d’origine', () => {
    const near = { defenderPos: { x: hoop.x, y: hoop.y + 80 }, originalManPos: { x: hoop.x + 90, y: hoop.y + 100 } };
    const far = { defenderPos: { x: hoop.x, y: hoop.y + 80 }, originalManPos: { x: hoop.x + 250, y: hoop.y + 200 } };
    const base = { carrierPos: { x: hoop.x, y: hoop.y + 320 }, hoop, triggerActive: false, returns: [near, near] };
    expect(isCalmForScramble(base)).toBe(true);
    expect(isCalmForScramble({ ...base, triggerActive: true })).toBe(false);
    expect(isCalmForScramble({ ...base, carrierPos: { x: hoop.x, y: hoop.y + 150 } })).toBe(false);
    expect(isCalmForScramble({ ...base, returns: [near, far] })).toBe(false);
  });

  it('cascade : pas de closeout si la passe ne va pas à l’homme libre', () => {
    const xOut = { xOutDef: 'D2', xOutMan: 'O2', orphan: 'O4' } as const;
    const matchups = { D2: 'O2', D4: 'O4' } as Matchups;
    const params = {
      stepIdx: 3,
      off: { O4: { x: 150, y: 200 } } as AttackerPositions,
      ballCarrier: 'O1' as const,
      prevBallCarrier: 'O1' as const,
      prevPositions: { D2: { x: 160, y: 230 }, D4: { x: 300, y: 150 } } as never,
      busyDefenders: new Set<never>(),
    };
    expect(decideCascadeSwap('auto', xOut, matchups, params)).toBeNull();
    expect(decideCascadeSwap('auto', xOut, { ...matchups }, { ...params, ballCarrier: 'O4' }))
      .toMatchObject({ a: 'D2', aTakes: 'O4', b: 'D4', bTakes: 'O2', kind: 'cascade' });
    expect(decideCascadeSwap('recover', xOut, { ...matchups }, { ...params, ballCarrier: 'O4' })).toBeNull();
  });

  it('cascade : le garde de l’homme libre, plus proche, le garde', () => {
    const xOut = { xOutDef: 'D2', xOutMan: 'O2', orphan: 'O4' } as const;
    const swap = decideCascadeSwap('auto', xOut, { D2: 'O2', D4: 'O4' } as Matchups, {
      stepIdx: 3,
      off: { O4: { x: 150, y: 200 } } as AttackerPositions,
      ballCarrier: 'O4',
      prevBallCarrier: 'O1',
      prevPositions: { D2: { x: 300, y: 300 }, D4: { x: 160, y: 190 } } as never,
      busyDefenders: new Set(),
    });
    expect(swap).toBeNull();
  });
});
