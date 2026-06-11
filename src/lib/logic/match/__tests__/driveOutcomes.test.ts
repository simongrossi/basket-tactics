// 2b.1 — Issues du drive dans le match-sim (spec 2026-06-03).
//
// Le défenseur du porteur peut couper la pénétration en zone dangereuse :
// contained → pull-up, walled → kick-out (ou strip), beaten → continue.
// Tout est gardé par `driveContainmentEnabled` (default off → flux inchangé).
//
// Géométries calibrées sur le cœur pur (`evaluateDriveContainment`,
// defenseMaxSpeed=110, CONTAIN_MARGIN_STEPS=0.15, hoop=(300,75)) :
//   walled    : D1 (300,150) SUR la ligne → etaDef=0,    etaCarrier=50/110 → margin −0.45
//   contained : D1 (340,160) à équidistance du containPoint (300,160) → margin 0
//   beaten    : D1 (300,270) DERRIÈRE le porteur → cp=porteur, margin +0.64

import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type { AppState, Point } from '@/lib/types';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
  type MatchState,
} from '../gameLoop';
import { seededAiRng } from '../aiPossession';
import { STRIP_PROBABILITY } from '../decisions/driveOutcome';
import type { OffensiveAction } from '../../offense';

const DRIVE_TARGET: Point = { x: 300, y: 95 };

function driveAction(): OffensiveAction {
  return {
    type: 'drive',
    shotPos: { ...DRIVE_TARGET },
    expectedPoints: 1.2,
    successRate: 0.6,
    scoreProbability: 0.6,
    shotPoints: 2,
    label: 'drive test',
  };
}

/** Construit un match en plein drive : O1 à (300,200) — dans la zone de
 *  décision (dist au panier 125 < 140) — parti de (300,380), D1 placé
 *  selon le scénario. Les autres joueurs sont écartés du couloir. */
function buildDriveScenario(
  d1Pos: Point,
  seed: number,
  flagOn: boolean
): { matchState: MatchState; baseState: AppState } {
  const baseState: AppState = {
    ...makeInitialState(),
    driveContainmentEnabled: flagOn,
  };
  const matchState = createInitialMatchState(baseState, { seed });
  matchState.carrier = 'O1';
  matchState.off = {
    O1: { x: 300, y: 200 },
    O2: { x: 60, y: 470 },
    O3: { x: 540, y: 470 },
    O4: { x: 80, y: 300 },
    O5: { x: 520, y: 300 },
  };
  matchState.defPos = {
    ...matchState.defPos,
    D1: { ...matchState.defPos.D1, x: d1Pos.x, y: d1Pos.y, matchedTo: 'O1', isCarrierDefender: true },
    D2: { ...matchState.defPos.D2, x: 90, y: 440, matchedTo: 'O2' },
    D3: { ...matchState.defPos.D3, x: 510, y: 440, matchedTo: 'O3' },
    D4: { ...matchState.defPos.D4, x: 110, y: 280, matchedTo: 'O4' },
    D5: { ...matchState.defPos.D5, x: 490, y: 280, matchedTo: 'O5' },
  };
  matchState.ballPos = { x: 316, y: 184 };
  matchState.intent = {
    kind: 'drive',
    target: { ...DRIVE_TARGET },
    expectedAction: driveAction(),
    startPos: { x: 300, y: 380 },
  };
  return { matchState, baseState };
}

/** RNG d'issue telle que produite par le câblage au 1er tick
 *  (tickCount passe à 1 → seed + 1*53 + 7). */
function expectedStripAtFirstTick(seed: number): boolean {
  return seededAiRng(seed + 53 + 7)() < STRIP_PROBABILITY;
}

/** Trouve un seed produisant l'issue strip (ou non) au 1er tick. */
function findSeed(strip: boolean): number {
  for (let s = 1; s < 500; s += 1) {
    if (expectedStripAtFirstTick(s) === strip) return s;
  }
  throw new Error('aucun seed trouvé — STRIP_PROBABILITY dégénérée ?');
}

describe('2b.1 — issues du drive dans le match-sim', () => {
  it('flag OFF (default) : le drive avance vers le cercle, flux inchangé', () => {
    const { matchState, baseState } = buildDriveScenario({ x: 300, y: 150 }, 42, false);
    const next = tickMatch(matchState, MATCH_TICK_MS, baseState);
    expect(next.intent.kind).toBe('drive');
    expect(next.outcome).toBeNull();
    // Le porteur a avancé de MAX_CARRIER_STEP_PX vers la cible.
    expect(next.off.O1.y).toBeLessThan(200);
    // Pas d'évaluation : resolved jamais posé.
    expect((next.intent as { resolved?: boolean }).resolved).toBeUndefined();
  });

  it('contained → pull-up : intent devient shoot à la position courante (pas au cercle)', () => {
    const { matchState, baseState } = buildDriveScenario({ x: 340, y: 160 }, 42, true);
    const next = tickMatch(matchState, MATCH_TICK_MS, baseState);
    expect(next.intent.kind).toBe('shoot');
    if (next.intent.kind === 'shoot') {
      expect(next.intent.forced).toBe(false);
      expect(next.intent.action.type).toBe('shoot');
      // Tir depuis la position courante (~y 200), pas un layup au cercle.
      expect(next.intent.action.shotPos.y).toBeGreaterThan(150);
    }
    expect(next.outcome).toBeNull();
  });

  it('walled + rng strip → turnover-drive + stat turnover + event', () => {
    const seed = findSeed(true);
    const { matchState, baseState } = buildDriveScenario({ x: 300, y: 150 }, seed, true);
    const next = tickMatch(matchState, MATCH_TICK_MS, baseState);
    expect(next.outcome).toBe('turnover-drive');
    expect(next.intent.kind).toBe('idle');
    expect(next.teamStats.home.turnovers).toBe(1);
    const ev = next.eventLog.find((e) => e.type === 'turnover');
    expect(ev?.label).toContain('Strip sur drive O1 par D1');
  });

  it('walled + rng kick-out → intent pass vers un receveur', () => {
    const seed = findSeed(false);
    const { matchState, baseState } = buildDriveScenario({ x: 300, y: 150 }, seed, true);
    const next = tickMatch(matchState, MATCH_TICK_MS, baseState);
    expect(next.intent.kind).toBe('pass');
    if (next.intent.kind === 'pass') {
      expect(next.intent.receiver).not.toBe('O1');
      expect(next.intent.progress).toBe(0);
    }
    expect(next.outcome).toBeNull();
  });

  it('beaten → continue : le drive poursuit vers le cercle, resolved posé (anti-flapping)', () => {
    const { matchState, baseState } = buildDriveScenario({ x: 300, y: 270 }, 42, true);
    const next = tickMatch(matchState, MATCH_TICK_MS, baseState);
    expect(next.intent.kind).toBe('drive');
    expect((next.intent as { resolved?: boolean }).resolved).toBe(true);
    expect(next.off.O1.y).toBeLessThan(200);
    // Tick suivant : pas de ré-évaluation, le drive continue normalement.
    const after = tickMatch(next, MATCH_TICK_MS, baseState);
    expect(after.intent.kind).toBe('drive');
    expect(after.off.O1.y).toBeLessThan(next.off.O1.y);
  });

  it('déterminisme : même seed → même issue sur deux exécutions', () => {
    const seed = 137;
    const run = () => {
      const { matchState, baseState } = buildDriveScenario({ x: 300, y: 150 }, seed, true);
      return tickMatch(matchState, MATCH_TICK_MS, baseState);
    };
    const a = run();
    const b = run();
    expect(a.intent.kind).toBe(b.intent.kind);
    expect(a.outcome).toBe(b.outcome);
    expect(a.teamStats.home.turnovers).toBe(b.teamStats.home.turnovers);
  });

  it('hors zone de décision : pas d’évaluation même flag ON', () => {
    const { matchState, baseState } = buildDriveScenario({ x: 300, y: 150 }, 42, true);
    // Porteur encore loin du panier (300,380 → dist 305 > 140).
    matchState.off.O1 = { x: 300, y: 380 };
    matchState.intent = {
      kind: 'drive',
      target: { ...DRIVE_TARGET },
      expectedAction: driveAction(),
      startPos: { x: 300, y: 470 },
    };
    const next = tickMatch(matchState, MATCH_TICK_MS, baseState);
    expect(next.intent.kind).toBe('drive');
    expect((next.intent as { resolved?: boolean }).resolved).toBeUndefined();
  });
});
