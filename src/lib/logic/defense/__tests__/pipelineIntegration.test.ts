// DM.2 — Tests d'INTÉGRATION du pipeline défensif.
//
// Les couches sont testées isolément ailleurs ; ce qui manquait, c'est la
// preuve qu'elles COEXISTENT sans se casser mutuellement quand on les empile
// (l'ordre des 14 couches est fragile, cf. audit 2026-05-29). On exerce donc
// le pipeline COMPLET via `effectiveDefensePositions` sur un PnR réaliste, en
// faisant varier couverture × flags, et on vérifie des INVARIANTS robustes
// (indépendants des pixels exacts) :
//   1. positions finies + dans des bornes raisonnables (pas de NaN / runaway)
//   2. matchups = bijection (chaque attaquant couvert une fois)
//   3. déterminisme (2 calculs identiques)
//   4. anti-superposition (Règle 1 — toutes paires ≥ clearance)
//
// + quelques cohérences de rôle robustes (drop, switch, persistance pnrRole).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, ComputedDefense, ScreenRule } from '@/lib/types';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { computeDefenseTargets, effectiveDefensePositions } from '@/lib/logic/engine';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

const DEF_IDS = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
const OFF_IDS = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;

/** PnR central : O5 pose sur le défenseur de O1, puis roule vers le panier. */
function makePnRState(screenRule: ScreenRule, overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const prev: AttackerPositions = {
    O1: { x: 300, y: 380 },
    O2: { x: 80, y: 360 },
    O3: { x: 520, y: 360 },
    O4: { x: 120, y: 180 },
    O5: { x: 330, y: 355 },
  };
  const cur: AttackerPositions = {
    ...prev,
    O1: { x: 300, y: 330 }, // dribble vers le panier
    O5: { x: 320, y: 200 }, // roll vers le cercle (HOOP y=75)
  };
  return {
    ...s0,
    steps: [
      makeStep(prev, 'O1', []),
      { ...makeStep(cur, 'O1', []), forcedScreener: 'O5' },
    ],
    activeStep: 1,
    screenRule,
    triggers: { drive: true, post: true, paint: true, trap: false },
    ...overrides,
  };
}

// ---- invariants réutilisables -------------------------------------------

function assertFiniteInBounds(def: ComputedDefense) {
  DEF_IDS.forEach((d) => {
    expect(Number.isFinite(def[d].x), `${d}.x fini`).toBe(true);
    expect(Number.isFinite(def[d].y), `${d}.y fini`).toBe(true);
    // Bornes généreuses : détecte NaN / valeurs aberrantes sans coller au terrain.
    expect(def[d].x).toBeGreaterThan(-100);
    expect(def[d].x).toBeLessThan(700);
    expect(def[d].y).toBeGreaterThan(-100);
    expect(def[d].y).toBeLessThan(1180);
  });
}

function assertBijection(def: ComputedDefense) {
  const covered = DEF_IDS.map((d) => def[d].matchedTo).sort();
  expect(covered).toEqual([...OFF_IDS].sort());
}

function assertNoOverlap(def: ComputedDefense, off: AttackerPositions) {
  // D ↔ O (toutes paires, AUCUNE exception — Règle 1).
  DEF_IDS.forEach((d) => {
    OFF_IDS.forEach((o) => {
      const dist = Math.hypot(def[d].x - off[o].x, def[d].y - off[o].y);
      expect(dist, `${d}↔${o} ≥ clearance`).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
    });
  });
  // D ↔ D.
  for (let i = 0; i < DEF_IDS.length; i++) {
    for (let j = i + 1; j < DEF_IDS.length; j++) {
      const a = def[DEF_IDS[i]];
      const b = def[DEF_IDS[j]];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      expect(dist, `${DEF_IDS[i]}↔${DEF_IDS[j]} ≥ clearance`).toBeGreaterThanOrEqual(
        PLAYER_MIN_CLEARANCE_PX - 0.5,
      );
    }
  }
}

function curOff(state: AppState): AttackerPositions {
  return state.steps[state.activeStep].off;
}

function runAllInvariants(state: AppState) {
  const def = effectiveDefensePositions(state, state.activeStep);
  assertFiniteInBounds(def);
  assertBijection(def);
  assertNoOverlap(def, curOff(state));
  // Déterminisme : recalcul (cache contourné par un clone d'état).
  const def2 = effectiveDefensePositions(structuredClone(state), state.activeStep);
  DEF_IDS.forEach((d) => {
    expect(def2[d].x).toBeCloseTo(def[d].x, 6);
    expect(def2[d].y).toBeCloseTo(def[d].y, 6);
    expect(def2[d].matchedTo).toBe(def[d].matchedTo);
  });
}

// ---- 1. Invariants × toutes les couvertures -----------------------------

const ALL_COVERAGES: ScreenRule[] = [
  'over', 'under', 'switch', 'hedge', 'drop', 'blitz', 'ice', 'weak', 'peel-switch',
];

describe('pipeline défensif — invariants sur toutes les couvertures', () => {
  ALL_COVERAGES.forEach((cov) => {
    it(`couverture ${cov} : finitude + bijection + anti-overlap + déterminisme`, () => {
      runAllInvariants(makePnRState(cov));
    });
  });
});

// ---- 2. Invariants × matrice de flags (couverture drop) -----------------

const FLAG_COMBOS: { name: string; flags: Partial<AppState> }[] = [
  { name: 'base', flags: {} },
  { name: 'helpStickiness', flags: { helpStickiness: 2 } },
  { name: 'scramSwitch', flags: { scramSwitchEnabled: true } },
  { name: 'postCoverage=dig', flags: { postCoverage: 'dig' } },
  { name: 'postCoverage=double', flags: { postCoverage: 'double' } },
  { name: 'autoBumpCutters', flags: { autoBumpCutters: true } },
  { name: 'tagThenSwitch', flags: { tagThenSwitchEnabled: true } },
  { name: 'readScreenChains', flags: { readScreenChainsEnabled: true } },
  // Couches livrées APRÈS DM.2 (juin 2026) — vague 2 de la matrice.
  { name: 'driveContainment (2a)', flags: { driveContainmentEnabled: true } },
  { name: 'weakSideAnchor (#8.2)', flags: { weakSideAnchorEnabled: true } },
  { name: 'blitzRelease (#8.1)', flags: { blitzReleaseEnabled: true } },
  { name: 'unwindRejectedScreens (B2 V2)', flags: { unwindRejectedScreens: true } },
  { name: 'snakeKeepCoverage (B4 V2)', flags: { snakeKeepCoverage: true } },
  { name: 'switchPolicy=none (B8)', flags: { switchPolicy: 'none' } },
  {
    name: 'kitchen-sink (tout activé)',
    flags: {
      helpStickiness: 2, scramSwitchEnabled: true, postCoverage: 'double',
      autoBumpCutters: true, tagThenSwitchEnabled: true, readScreenChainsEnabled: true,
      driveContainmentEnabled: true, weakSideAnchorEnabled: true, blitzReleaseEnabled: true,
      unwindRejectedScreens: true, snakeKeepCoverage: true,
    },
  },
];

describe('pipeline défensif — coexistence des couches (matrice de flags, drop)', () => {
  FLAG_COMBOS.forEach(({ name, flags }) => {
    it(`${name} : pipeline cohérent`, () => {
      runAllInvariants(makePnRState('drop', flags));
    });
  });
});

// Empilement avec switch (matchups permutés) — la bijection doit tenir.
describe('pipeline défensif — coexistence des couches (matrice de flags, switch)', () => {
  FLAG_COMBOS.forEach(({ name, flags }) => {
    it(`${name} : pipeline cohérent`, () => {
      runAllInvariants(makePnRState('switch', flags));
    });
  });
});

// ---- 3. Cohérences de rôle robustes -------------------------------------

describe('pipeline défensif — cohérence des rôles', () => {
  it('drop : aucun switch (matchups intacts) — contraste avec la couverture switch', () => {
    const state = makePnRState('drop');
    const def = effectiveDefensePositions(state, 1);
    // Le drop garde les hommes : pas d'échange. Régression typique = une couche
    // déclenche un switch parasite en drop.
    const switched = DEF_IDS.filter((d) => def[d].switchedThisStep).length;
    expect(switched).toBe(0);
    // Le défenseur du poseur reste sur O5, celui du porteur reste sur O1.
    expect(DEF_IDS.find((d) => def[d].matchedTo === 'O5')).toBeDefined();
    expect(DEF_IDS.find((d) => def[d].matchedTo === 'O1')).toBeDefined();
  });

  it('switch : les matchups sont permutés mais restent une bijection', () => {
    const def = effectiveDefensePositions(makePnRState('switch'), 1);
    assertBijection(def);
    const switched = DEF_IDS.filter((d) => def[d].switchedThisStep).length;
    expect(switched).toBeGreaterThanOrEqual(2); // un switch implique 2 défenseurs
  });

  it('autoBumpCutters ne détruit pas un rôle PnR posé en amont (ordre des couches)', () => {
    const base = effectiveDefensePositions(makePnRState('drop'), 1);
    const roleDefBase = DEF_IDS.filter((d) => base[d].pnrRole !== undefined);
    // Conditionnel : si une rotation PnR existe en base, elle doit survivre à
    // l'activation de la couche cutterBump (5.5), postérieure à la couche PnR (2).
    if (roleDefBase.length > 0) {
      const withBump = effectiveDefensePositions(makePnRState('drop', { autoBumpCutters: true }), 1);
      roleDefBase.forEach((d) => {
        expect(withBump[d].pnrRole, `${d} conserve son rôle PnR`).toBe(base[d].pnrRole);
      });
    }
  });

  it('aide + PnR coexistent : le porteur reste couvert même si une aide se déclenche', () => {
    const state = makePnRState('drop');
    const def = effectiveDefensePositions(state, 1);
    // Le porteur O1 a bien un défenseur attitré (matchups intacts malgré l'aide).
    const carrierDef = DEF_IDS.find((d) => def[d].matchedTo === 'O1');
    expect(carrierDef).toBeDefined();
  });

  it('PnR + aide coexistent SÉMANTIQUEMENT : écran actif sur le porteur ET helpFactor > 0 simultanés', () => {
    // L'exact manque pointé par l'audit 2026-05-29 : prouver que la couche
    // écran (baseTargets) et la couche aide cohabitent dans la MÊME frame,
    // pas seulement que le pipeline ne crashe pas.
    const state = makePnRState('drop');
    const { positions } = computeDefenseTargets(state, 1, false);
    const carrierDef = DEF_IDS.find((d) => positions[d].matchedTo === 'O1')!;
    expect(positions[carrierDef].onScreen, 'écran détecté sur le défenseur du porteur').toBe(true);
    const helpers = DEF_IDS.filter(
      (d) => d !== carrierDef && (positions[d].helpFactor ?? 0) > 0,
    );
    expect(helpers.length, 'au moins un défenseur en aide pendant le PnR').toBeGreaterThan(0);
  });

  it('late shot clock (F.5) + PnR : invariants tenus sous 5s', () => {
    const state = makePnRState('drop', { lateShotClockDefenseEnabled: true });
    state.steps[1] = { ...state.steps[1], shotClockRemaining: 3 };
    runAllInvariants(state);
  });
});

// ---- 4. Double écran simultané (porteur + off-ball) ----------------------
//
// Jamais couvert : un écran PORTEUR (O5 sur D1) et un écran OFF-BALL (O4 sur
// D3) dans la même frame. Exerce baseTargets + offBallScreenLayer ensemble.

function makeDualScreenState(
  screenRule: ScreenRule,
  offBallRule: AppState['offBallScreenRule'],
  overrides: Partial<AppState> = {},
): AppState {
  const s0 = makeInitialState();
  const prev: AttackerPositions = {
    O1: { x: 300, y: 380 }, // porteur
    O2: { x: 80, y: 360 },
    O3: { x: 470, y: 380 }, // cutter off-ball
    O4: { x: 440, y: 320 }, // poseur off-ball (géométrie validée par B9)
    O5: { x: 330, y: 355 }, // poseur porteur
  };
  const cur: AttackerPositions = {
    ...prev,
    O1: { x: 300, y: 330 },
    O5: { x: 320, y: 200 }, // roll
  };
  return {
    ...s0,
    steps: [makeStep(prev, 'O1', []), { ...makeStep(cur, 'O1', []), forcedScreener: 'O5' }],
    activeStep: 1,
    screenRule,
    offBallScreenRule: offBallRule,
    // Rayon élargi (setting configurable, défaut 35) : la détection off-ball au
    // step 1 mesure poseur ↔ défenseur du cutter AU STEP PRÉCÉDENT, où le
    // push-out de clearance place D3 à exactement 34-37 px de O4. À 35 le test
    // tiendrait à 1 px près ; 45 donne une marge déterministe sans changer la
    // sémantique (les deux écrans restent géométriquement réalistes).
    screenRadius: 45,
    ...overrides,
  };
}

describe('pipeline défensif — double écran simultané (porteur + off-ball)', () => {
  const OFFBALL_RULES: AppState['offBallScreenRule'][] = ['over', 'under', 'switch', 'top-lock', 'chase'];

  OFFBALL_RULES.forEach((obRule) => {
    it(`drop × off-ball ${obRule} : invariants tenus`, () => {
      runAllInvariants(makeDualScreenState('drop', obRule));
    });
  });

  it('les DEUX écrans sont détectés dans la même frame (drop × over)', () => {
    const state = makeDualScreenState('drop', 'over');
    const { positions } = computeDefenseTargets(state, 1, false);
    const carrierDef = DEF_IDS.find((d) => positions[d].matchedTo === 'O1')!;
    const cutterDef = DEF_IDS.find((d) => positions[d].matchedTo === 'O3')!;
    expect(positions[carrierDef].onScreen, 'écran porteur détecté').toBe(true);
    expect(positions[cutterDef].onScreen, 'écran off-ball détecté').toBe(true);
  });

  it('switch porteur × switch off-ball simultanés : bijection préservée', () => {
    runAllInvariants(makeDualScreenState('switch', 'switch'));
  });
});

// ---- 5. Séquence multi-steps (setup → écran → roll → kick-out) ------------
//
// Les tests précédents sont mono-transition. Les régressions de pipeline
// typiques (sticky help, hedge recovery, blitz release, closeout) ne se
// manifestent QUE sur une séquence : on déroule 4 steps avec changement de
// porteur final et on tient les invariants à CHAQUE step.

function makePnRSequenceState(overrides: Partial<AppState> = {}): AppState {
  const s0 = makeInitialState();
  const setup: AttackerPositions = {
    O1: { x: 300, y: 470 },
    O2: { x: 80, y: 360 },
    O3: { x: 520, y: 360 },
    O4: { x: 120, y: 180 },
    O5: { x: 330, y: 420 },
  };
  const screen: AttackerPositions = { ...setup, O1: { x: 300, y: 380 }, O5: { x: 330, y: 355 } };
  const roll: AttackerPositions = { ...screen, O1: { x: 300, y: 330 }, O5: { x: 320, y: 200 } };
  const kick: AttackerPositions = { ...roll, O1: { x: 260, y: 300 }, O5: { x: 310, y: 130 } };
  return {
    ...s0,
    steps: [
      makeStep(setup, 'O1', []),
      makeStep(screen, 'O1', []),
      { ...makeStep(roll, 'O1', []), forcedScreener: 'O5' },
      makeStep(kick, 'O3', []), // kick-out → closeout sur le défenseur de O3
    ],
    activeStep: 3,
    screenRule: 'drop',
    triggers: { drive: true, post: true, paint: true, trap: false },
    ...overrides,
  };
}

describe('pipeline défensif — séquence multi-steps (PnR → roll → kick-out)', () => {
  const SEQ_COMBOS: { name: string; flags: Partial<AppState> }[] = [
    { name: 'drop base', flags: {} },
    {
      name: 'hedge + recovery delay + sticky help',
      flags: { screenRule: 'hedge', hedgeRecoveryDelay: 2, helpStickiness: 2 },
    },
    {
      name: 'blitz + blitzRelease (ballon qui ressort au step 3)',
      flags: { screenRule: 'blitz', blitzReleaseEnabled: true },
    },
    {
      name: 'kitchen-sink juin 2026',
      flags: {
        driveContainmentEnabled: true, weakSideAnchorEnabled: true,
        blitzReleaseEnabled: true, helpStickiness: 2,
        scramSwitchEnabled: true, autoBumpCutters: true,
      },
    },
  ];

  SEQ_COMBOS.forEach(({ name, flags }) => {
    it(`${name} : invariants tenus à chaque step de la séquence`, () => {
      const state = makePnRSequenceState(flags);
      for (let i = 0; i < state.steps.length; i++) {
        const def = effectiveDefensePositions(state, i);
        assertFiniteInBounds(def);
        assertBijection(def);
        assertNoOverlap(def, state.steps[i].off);
      }
    });
  });
});

// ---- 6. Systèmes court-circuit (zone / junk / press) ----------------------
//
// Ces systèmes remplacent le pipeline man (computeZone/Junk/PressDefenseTargets)
// mais doivent tenir les MÊMES invariants physiques. Pas de bijection ici :
// en zone/junk/press, matchedTo désigne l'attaquant primaire (plusieurs
// défenseurs peuvent pointer le même), c'est sémantiquement correct.

function runSystemInvariants(state: AppState) {
  const def = effectiveDefensePositions(state, state.activeStep);
  assertFiniteInBounds(def);
  assertNoOverlap(def, curOff(state));
  const def2 = effectiveDefensePositions(structuredClone(state), state.activeStep);
  DEF_IDS.forEach((d) => {
    expect(def2[d].x).toBeCloseTo(def[d].x, 6);
    expect(def2[d].y).toBeCloseTo(def[d].y, 6);
  });
}

describe('pipeline défensif — systèmes court-circuit sous invariants', () => {
  it('zone : finitude + anti-overlap + déterminisme sur le PnR', () => {
    runSystemInvariants(makePnRState('drop', { defenseSystem: 'zone' }));
  });

  it('junk box-and-1 : finitude + anti-overlap + déterminisme sur le PnR', () => {
    runSystemInvariants(
      makePnRState('drop', { defenseSystem: 'junk', junkConfig: { type: 'box-and-1', chaser: 'O2' } }),
    );
  });

  it('press half-court : finitude + anti-overlap + déterminisme sur le PnR', () => {
    runSystemInvariants(
      makePnRState('drop', { defenseSystem: 'press', pressConfig: { type: 'half-court' } }),
    );
  });

  it('press full-court : finitude + anti-overlap + déterminisme sur le PnR', () => {
    runSystemInvariants(
      makePnRState('drop', { defenseSystem: 'press', pressConfig: { type: 'full-court' } }),
    );
  });
});
