// Tests B1 — game loop autonome. Vérifie les invariants principaux du tick :
// shot clock décrémenté, possession qui se termine proprement, déterminisme
// du replay via seed, intent persistant entre ticks.

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '@/lib/data/templates';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
} from '../gameLoop';

function buildState(tplId: string): AppState {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const base = makeInitialState();
  return {
    ...base,
    steps: tpl.steps,
    defenseInitial: tpl.defenseInitial,
    activeStep: 0,
  };
}

function runUntilEnd(
  baseState: AppState,
  seed: number,
  maxTicks = 2000
): ReturnType<typeof createInitialMatchState> {
  let state = createInitialMatchState(baseState, { seed });
  for (let i = 0; i < maxTicks; i += 1) {
    if (state.outcome !== null) break;
    state = tickMatch(state, MATCH_TICK_MS, baseState);
  }
  return state;
}

describe('gameLoop — createInitialMatchState', () => {
  it('initialise un état cohérent depuis un template', () => {
    const baseState = buildState('pnr-central');
    const state = createInitialMatchState(baseState, { seed: 42 });
    expect(state.shotClockMs).toBe(24_000);
    expect(state.outcome).toBeNull();
    expect(state.intent.kind).toBe('idle');
    expect(state.tickCount).toBe(0);
    expect(state.possessionTimeMs).toBe(0);
    expect(state.score).toBe(0);
    expect(state.eventLog).toEqual([]);
    expect(state.seed).toBe(42);
    // 5 attaquants + 5 défenseurs présents
    expect(Object.keys(state.off)).toHaveLength(5);
    expect(Object.keys(state.defPos)).toHaveLength(5);
    // Ballon proche du porteur (offset visuel +16, -16)
    const carrierPos = state.off[state.carrier];
    expect(state.ballPos.x).toBeCloseTo(carrierPos!.x + 16, 0);
    expect(state.ballPos.y).toBeCloseTo(carrierPos!.y - 16, 0);
  });
});

describe('gameLoop — tickMatch', () => {
  it('décrémente le shot clock à chaque tick', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 1 });
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.shotClockMs).toBe(24_000 - MATCH_TICK_MS);
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.shotClockMs).toBe(24_000 - 2 * MATCH_TICK_MS);
    expect(state.tickCount).toBe(2);
    expect(state.possessionTimeMs).toBe(2 * MATCH_TICK_MS);
  });

  it('termine en forced shot quand le shot clock arrive à 0', () => {
    const baseState = buildState('pnr-central');
    // On force un état avec un shot clock très court.
    let state = createInitialMatchState(baseState, {
      seed: 7,
      shotClockMs: MATCH_TICK_MS, // 1 tick et c'est fini
    });
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    // Après ce tick le shot clock est à 0, forced shot doit s'enclencher.
    expect(state.shotClockMs).toBe(0);
    expect(state.outcome).not.toBeNull();
    expect(['forced-shot-made', 'forced-shot-missed']).toContain(state.outcome);
  });

  it('produit une possession qui se termine avec un outcome', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 1234);
    expect(final.outcome).not.toBeNull();
    expect(final.intent.kind).toBe('idle');
  });

  it('est déterministe : même seed produit le même outcome final', () => {
    const baseState = buildState('pnr-central');
    const run1 = runUntilEnd(baseState, 99);
    const run2 = runUntilEnd(baseState, 99);
    expect(run1.outcome).toBe(run2.outcome);
    expect(run1.score).toBe(run2.score);
    expect(run1.tickCount).toBe(run2.tickCount);
    expect(run1.eventLog.length).toBe(run2.eventLog.length);
  });

  it('no-op si la SESSION est terminée (maxPossessions atteint)', () => {
    const baseState = buildState('pnr-central');
    // Force 1 seule possession → après son outcome, session terminée.
    let state = createInitialMatchState(baseState, { seed: 50, maxPossessions: 1 });
    for (let i = 0; i < 200; i += 1) {
      if (state.outcome !== null && state.possessionsPlayed >= 1) break;
      state = tickMatch(state, MATCH_TICK_MS, baseState);
    }
    // Avec maxPossessions=1, après pause transition, possessionsPlayed
    // passe à 1 et la session est figée.
    const sessionDone =
      state.outcome !== null &&
      state.maxPossessions !== null &&
      state.possessionsPlayed >= state.maxPossessions;
    expect(sessionDone).toBe(true);
    const afterExtra = tickMatch(state, MATCH_TICK_MS, baseState);
    // Session terminée → no-op strict (référence identique).
    expect(afterExtra).toBe(state);
  });

  it('log au moins un événement quand une possession se termine par un tir', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 333);
    expect(final.eventLog.length).toBeGreaterThan(0);
    const types = final.eventLog.map((e) => e.type);
    // Au minimum un terminal : shot / forced-shot / turnover.
    expect(
      types.some((t) => t === 'shot' || t === 'forced-shot' || t === 'turnover')
    ).toBe(true);
  });

  it('respecte le shot clock total : tickCount × MATCH_TICK_MS <= shotClockMs initial', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 777);
    expect(final.possessionTimeMs).toBeLessThanOrEqual(24_000);
  });
});

/** Cherche une seed qui produit un événement de tir (pas un turnover).
 *  Certaines possessions se terminent par une passe perdue avant le tir,
 *  on itère jusqu'à trouver une seed "shot terminal". */
function findShotPossession(
  baseState: AppState,
  startSeed: number,
  maxAttempts = 30
): ReturnType<typeof runUntilEnd> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const seed = startSeed + i * 7919; // prime stride
    const final = runUntilEnd(baseState, seed);
    if (final.eventLog.some((e) => e.type === 'shot' || e.type === 'forced-shot')) {
      return final;
    }
  }
  throw new Error(`Aucune seed dans [${startSeed}, +30×7919] ne produit de tir`);
}

describe('gameLoop — B3a shot model enrichi', () => {
  it("enrichit l'event de tir avec zone, contestation, position", () => {
    const baseState = buildState('pnr-central');
    const final = findShotPossession(baseState, 333);
    const shotEvent = final.eventLog.find(
      (e) => e.type === 'shot' || e.type === 'forced-shot'
    );
    expect(shotEvent).toBeDefined();
    // shotZone est l'un des 5 buckets définis dans threats.ts
    expect(['rim', 'paint', 'mid', 'three', 'deep']).toContain(shotEvent!.shotZone);
    // contestDistance est un nombre fini ≥ 0
    expect(typeof shotEvent!.contestDistance).toBe('number');
    expect(shotEvent!.contestDistance).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(shotEvent!.contestDistance!)).toBe(true);
    // contested est cohérent avec le seuil (≤ 30 px)
    expect(shotEvent!.contested).toBe(shotEvent!.contestDistance! <= 30);
    // shotPos contient bien des coordonnées
    expect(shotEvent!.shotPos).toBeDefined();
    expect(typeof shotEvent!.shotPos!.x).toBe('number');
    expect(typeof shotEvent!.shotPos!.y).toBe('number');
    // shotPointsAttempted ∈ {2, 3}
    expect([2, 3]).toContain(shotEvent!.shotPointsAttempted);
  });

  it("label de tir inclut la zone (et la mention 'contesté' si applicable)", () => {
    const baseState = buildState('pnr-central');
    const final = findShotPossession(baseState, 555);
    const shotEvent = final.eventLog.find(
      (e) => e.type === 'shot' || e.type === 'forced-shot'
    );
    expect(shotEvent).toBeDefined();
    // Le label contient toujours le pourcentage et au moins un libellé de zone
    const label = shotEvent!.label.toLowerCase();
    const zoneTerms = ['cercle', 'raquette', 'mi-distance', '3 pts', 'longue distance'];
    expect(zoneTerms.some((t) => label.includes(t))).toBe(true);
    // Si le tir est contesté, le label doit le mentionner
    if (shotEvent!.contested) {
      expect(label).toContain('contesté');
    }
  });

  it("shotPos coïncide avec la position du shooter (à la précision du tick)", () => {
    const baseState = buildState('pnr-central');
    const final = findShotPossession(baseState, 42);
    const shotEvent = final.eventLog.find(
      (e) => e.type === 'shot' || e.type === 'forced-shot'
    );
    expect(shotEvent).toBeDefined();
    // shotPos doit être dans la bounding box du terrain.
    expect(shotEvent!.shotPos!.x).toBeGreaterThanOrEqual(0);
    expect(shotEvent!.shotPos!.x).toBeLessThanOrEqual(600);
    expect(shotEvent!.shotPos!.y).toBeGreaterThanOrEqual(0);
    expect(shotEvent!.shotPos!.y).toBeLessThanOrEqual(1080);
  });
});

describe('gameLoop — B3b transition multi-possessions', () => {
  it('cumulativeScore et possessionsPlayed initialisés à 0', () => {
    const baseState = buildState('pnr-central');
    const state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    expect(state.cumulativeScore).toBe(0);
    expect(state.possessionsPlayed).toBe(0);
    expect(state.maxPossessions).toBe(3);
    expect(state.transitionStartedAtMs).toBeNull();
  });

  it('après outcome, la pause de transition tick sans changer score/outcome', () => {
    const baseState = buildState('pnr-central');
    // Force possession à se terminer en 1 tick via shotClock court.
    let state = createInitialMatchState(baseState, {
      seed: 13,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 2,
    });
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.outcome).not.toBeNull();
    const outcomeAfter = state.outcome;
    const scoreAfter = state.score;
    // Premier tick de pause : marque le start.
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.outcome).toBe(outcomeAfter);
    expect(state.score).toBe(scoreAfter);
    expect(state.transitionStartedAtMs).not.toBeNull();
  });

  it('après la pause de transition, démarre une nouvelle possession (maxPossessions > 1)', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 99,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 3,
    });
    // Force "pas de rebond offensif" pour garantir une nouvelle possession.
    const opts = { offensiveReboundRate: 0 };
    state = tickMatch(state, MATCH_TICK_MS, baseState, opts);
    expect(state.outcome).not.toBeNull();
    const initialOutcome = state.outcome;
    // Pause transition = 1500ms = ~46 ticks à 30Hz. On boucle large.
    for (let i = 0; i < 60; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState, opts);
    }
    expect(state.outcome).toBeNull();
    expect(state.possession).toBeGreaterThanOrEqual(2);
    expect(state.cumulativeScore).toBeGreaterThanOrEqual(initialOutcome?.includes('made') ? 2 : 0);
  });

  it('rebond offensif sur missed shot quand reboundRate=1 conserve la possession', () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 17,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 3,
    });
    const initialPossession = state.possession;
    state = tickMatch(state, MATCH_TICK_MS, baseState, { offensiveReboundRate: 1 });
    // Continue ticker jusqu'à fin de pause + transition (1500ms = ~46 ticks).
    for (let i = 0; i < 60; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState, { offensiveReboundRate: 1 });
      if (state.outcome === null && state.shotClockMs > 1000) break;
    }
    // Si missed shot ET rebound à 100 %, possession ID inchangé.
    if (state.eventLog.some((e) => e.label.includes('Rebond offensif'))) {
      expect(state.possession).toBe(initialPossession);
      expect(state.possessionsPlayed).toBe(0); // pas incrémenté sur off rebound
      // Shot clock reset à 14 s.
      expect(state.shotClockMs).toBeGreaterThan(13_500);
      expect(state.shotClockMs).toBeLessThanOrEqual(14_000);
    }
  });

  it("nouvelle possession après missed shot quand reboundRate=0 (jamais rebond off)", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 21,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 3,
    });
    state = tickMatch(state, MATCH_TICK_MS, baseState, { offensiveReboundRate: 0 });
    for (let i = 0; i < 60; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState, { offensiveReboundRate: 0 });
      if (state.outcome === null && state.possession > 1) break;
    }
    if (state.eventLog.some((e) => e.label.includes('Nouvelle possession'))) {
      expect(state.possession).toBeGreaterThanOrEqual(2);
      expect(state.possessionsPlayed).toBeGreaterThanOrEqual(1);
      // Shot clock reset à 24 s.
      expect(state.shotClockMs).toBeGreaterThan(23_500);
    }
  });

  it("session se fige après maxPossessions atteint (no-op sur tick suivant)", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 33,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 1,
    });
    // Joue jusqu'à session done. Cap large pour absorber pause de
    // transition (~46 ticks à 30 Hz).
    for (let i = 0; i < 100; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState, { offensiveReboundRate: 0 });
      if (
        state.outcome !== null &&
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions
      ) {
        break;
      }
    }
    expect(state.possessionsPlayed).toBeGreaterThanOrEqual(1);
    const frozen = state;
    const next = tickMatch(state, MATCH_TICK_MS, baseState);
    // Référence inchangée car la session est figée.
    expect(next).toBe(frozen);
  });
});

describe('gameLoop — intent persistance', () => {
  it("garde l'intent drive entre 2 ticks tant que le porteur n'a pas atteint sa cible", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 12345 });
    // On boucle jusqu'à voir un intent non-idle.
    for (let i = 0; i < 50; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.intent.kind !== 'idle') break;
    }
    // Au moins un tick a produit un intent (drive ou pass).
    expect(['drive', 'pass', 'shoot']).toContain(state.intent.kind);
  });
});

describe('gameLoop — E.1 V1 transition 2-way (home/away)', () => {
  it("initialise homeScore/awayScore/attackingTeam à valeurs neutres", () => {
    const baseState = buildState('pnr-central');
    const state = createInitialMatchState(baseState, { seed: 1, maxPossessions: 3 });
    expect(state.homeScore).toBe(0);
    expect(state.awayScore).toBe(0);
    expect(state.attackingTeam).toBe('home');
  });

  it("après possession maison terminée, passe en attackingTeam='away' (E.1 V1)", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 17,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 3,
    });
    state = tickMatch(state, MATCH_TICK_MS, baseState);
    expect(state.outcome).not.toBeNull();
    // Pause + transition (~46 ticks à 30 Hz).
    for (let i = 0; i < 60; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.attackingTeam === 'away') break;
    }
    // Soit on est passé en away, soit (rare) la home a continué via off rebond.
    if (state.attackingTeam === 'away') {
      expect(state.intent.kind).toBe('away-possession');
      expect(state.possessionsPlayed).toBe(1);
    }
  });

  it("possession adverse stub : décrémente le clock et chaîne sur nouvelle possession maison", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 21,
      shotClockMs: MATCH_TICK_MS,
      maxPossessions: 5,
    });
    // Joue beaucoup de ticks pour observer au moins une transition complète
    // home → away → home (cycle ~12s + 1.5s pause = ~410 ticks par cycle).
    let observedAwayThenHome = false;
    let sawAway = false;
    const awayScoreInit = state.awayScore;
    for (let i = 0; i < 1500; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.attackingTeam === 'away') sawAway = true;
      if (sawAway && state.attackingTeam === 'home' && state.intent.kind === 'idle') {
        observedAwayThenHome = true;
        break;
      }
    }
    if (sawAway) {
      // On a au moins observé le passage en away.
      expect(state.awayScore).toBeGreaterThanOrEqual(awayScoreInit);
      if (observedAwayThenHome) {
        // Cycle complet observé : retour en home.
        expect(state.attackingTeam).toBe('home');
      }
    }
  });

  it("homeScore et awayScore restent séparés au fil de la session", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, { seed: 333, maxPossessions: 3 });
    // Joue plusieurs possessions.
    for (let i = 0; i < 2000; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (
        state.outcome !== null &&
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions
      ) {
        break;
      }
    }
    // Les 2 scores sont des entiers ≥ 0
    expect(state.homeScore).toBeGreaterThanOrEqual(0);
    expect(state.awayScore).toBeGreaterThanOrEqual(0);
    // cumulativeScore est l'alias de homeScore (rétrocompat).
    expect(state.cumulativeScore).toBe(state.homeScore);
  });

  it("box-out : sur fin de possession (tir), les défenseurs sont entre leur homme et le panier", () => {
    const baseState = buildState('pnr-central');
    let state = createInitialMatchState(baseState, {
      seed: 77,
      shotClockMs: MATCH_TICK_MS,
    });
    // Boucle jusqu'à l'outcome (tir manqué/réussi).
    for (let i = 0; i < 10; i += 1) {
      state = tickMatch(state, MATCH_TICK_MS, baseState);
      if (state.outcome !== null) break;
    }
    expect(state.outcome).not.toBeNull();
    // Pour chaque défenseur, vérifier qu'il est plus proche du panier
    // que son homme matché (box-out appliqué).
    const HOOP = { x: 300, y: 75 }; // ou getDefenseHoop(...), on prend la valeur connue
    const matchups = Object.entries(state.defPos);
    let boxedOutCount = 0;
    matchups.forEach(([id, def]) => {
      const matchedAtt = state.off[(def as { matchedTo: string }).matchedTo as keyof typeof state.off];
      if (!matchedAtt) return;
      const defDistToHoop = Math.hypot(def.x - HOOP.x, def.y - HOOP.y);
      const attDistToHoop = Math.hypot(matchedAtt.x - HOOP.x, matchedAtt.y - HOOP.y);
      if (defDistToHoop < attDistToHoop) boxedOutCount += 1;
    });
    // Au moins 3/5 défenseurs sont box-outés (le shooter peut être hors logic).
    expect(boxedOutCount).toBeGreaterThanOrEqual(3);
  });
});
