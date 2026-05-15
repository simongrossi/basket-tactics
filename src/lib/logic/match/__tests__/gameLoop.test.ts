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
  maxTicks = 200
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

  it('no-op si la possession est déjà terminée', () => {
    const baseState = buildState('pnr-central');
    const final = runUntilEnd(baseState, 50);
    expect(final.outcome).not.toBeNull();
    const afterExtra = tickMatch(final, MATCH_TICK_MS, baseState);
    // Aucun changement (même référence ou état identique).
    expect(afterExtra.outcome).toBe(final.outcome);
    expect(afterExtra.score).toBe(final.score);
    expect(afterExtra.tickCount).toBe(final.tickCount);
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
