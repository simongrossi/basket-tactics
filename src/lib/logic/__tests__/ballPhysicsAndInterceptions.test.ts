import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import type {
  AppState,
  AttackerId,
  ComputedDefender,
  DefenderId,
  Point,
} from '@/lib/types';
import { computeBallFrame } from '@/lib/logic/geometry';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
  type CarrierIntent,
} from '../match/gameLoop';
import { evaluateOffensiveOptions } from '../offense';
import { TEMPLATES } from '@/lib/data/templates';

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

function makeDef(partial: Partial<ComputedDefender> & { x: number; y: number; matchedTo: AttackerId }): ComputedDefender {
  return {
    late: false,
    helpFactor: 0,
    isCarrierDefender: false,
    onScreen: false,
    switchedThisStep: false,
    orientation: 0,
    gazeOrientation: 0,
    facing: { x: partial.x, y: partial.y - 10 },
    armBallSide: { x: partial.x + 5, y: partial.y },
    armManSide: { x: partial.x - 5, y: partial.y },
    ...partial,
  };
}

function passIntent(receiver: AttackerId, progress: number): CarrierIntent {
  return {
    kind: 'pass',
    receiver,
    progress,
    expectedAction: {
      type: 'pass-shoot',
      targetId: receiver,
      successRate: 0.99,
      expectedPoints: 2,
      scoreProbability: 0.5,
      shotPoints: 2,
      shotPos: { x: 0, y: 0 },
      label: 'Passe',
    },
  };
}

describe('Physique du dribble (dribblePhysicsEnabled)', () => {
  it('calcule des oscillations sinusoïdales du dribble si actif', () => {
    const prevCarrier: Point = { x: 100, y: 100 };
    const nextCarrier: Point = { x: 110, y: 100 }; // Joueur se déplace

    // Sans la physique du dribble, le ballon reste à z = 25 constant
    const frameNoPhysics = computeBallFrame(prevCarrier, nextCarrier, false, 0.5, 'direct', false);
    expect(frameNoPhysics.pos.z).toBe(25);

    // Avec la physique du dribble active, le ballon a des variations sinusoïdales de z
    const frame1 = computeBallFrame(prevCarrier, nextCarrier, false, 0.0, 'direct', true);
    const frame2 = computeBallFrame(prevCarrier, nextCarrier, false, 0.25, 'direct', true);
    const frame3 = computeBallFrame(prevCarrier, nextCarrier, false, 0.5, 'direct', true);

    expect(frame1.pos.z).toBeCloseTo(0, 2); // sin(0) = 0
    expect(frame2.pos.z).toBeGreaterThan(0);
    expect(frame3.pos.z).toBeCloseTo(0, 2); // sin(pi) = 0
    expect(frame1.pos.y).toBe(prevCarrier.y + 25); // y corrigé pour z=0 (ground level)
  });
});

describe('Interceptions actives (activeInterceptionsEnabled)', () => {
  it('les défenseurs proches interceptent parfois si face au ballon et z <= 55', () => {
    const baseState = buildState('pnr-central');
    baseState.activeInterceptionsEnabled = true;

    // Créons un état de match initialisé
    let state = createInitialMatchState(baseState, { seed: 42 });

    // Placer tous les défenseurs très loin pour éviter les interceptions parasites
    (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
      state.defPos[id] = makeDef({ x: 9999, y: 9999, gazeOrientation: 0, matchedTo: 'O1' });
    });

    // Modifions l'intent pour forcer une passe en cours entre O1 et O2
    state.carrier = 'O1';
    state.off.O1 = { x: 200, y: 200 };
    state.off.O2 = { x: 400, y: 200 };
    state.intent = passIntent('O2', 0.5);

    // Plaçons un défenseur D1 pile sur la ligne de passe, tourné vers le ballon
    state.defPos.D1 = makeDef({
      x: 300,
      y: 195, // distance très proche de (300, 200)
      gazeOrientation: 90, // fait face à la gauche (O1 est à gauche)
      matchedTo: 'O1',
    });

    // On fait tourner le game loop pour le tick de passe
    // On essaye avec plusieurs seeds pour forcer le roll RNG de 12%
    let intercepted = false;
    for (let seed = 0; seed < 50; seed++) {
      state.seed = seed;
      state.intent = passIntent('O2', 0.5); // Reset progress
      state.outcome = null;
      
      const nextState = tickMatch(state, MATCH_TICK_MS, baseState);
      if (nextState.outcome === 'turnover-pass' && nextState.eventLog.some(e => e.label.includes('Interception par D1'))) {
        intercepted = true;
        expect(nextState.ballPos.x).toBe(state.defPos.D1!.x);
        break;
      }
    }

    expect(intercepted).toBe(true);
  });

  it('pas d’interception si le défenseur regarde ailleurs (diff > 90°)', () => {
    const baseState = buildState('pnr-central');
    baseState.activeInterceptionsEnabled = true;

    let state = createInitialMatchState(baseState, { seed: 42 });

    // Placer tous les défenseurs très loin
    (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
      state.defPos[id] = makeDef({ x: 9999, y: 9999, gazeOrientation: 0, matchedTo: 'O1' });
    });

    state.carrier = 'O1';
    state.off.O1 = { x: 200, y: 200 };
    state.off.O2 = { x: 400, y: 200 };
    state.intent = passIntent('O2', 0.5);

    // Défenseur regarde à l'opposé (gazeOrientation = 0 (nord) alors que la balle est au sud)
    state.defPos.D1 = makeDef({
      x: 300,
      y: 195,
      gazeOrientation: 0, // regarde en haut, dos au ballon qui est en bas
      matchedTo: 'O1',
    });

    // Itérons sur toutes les seeds possibles, aucune ne doit intercepter car regard invalide
    for (let seed = 0; seed < 50; seed++) {
      state.seed = seed;
      state.intent = passIntent('O2', 0.5);
      state.outcome = null;
      
      const nextState = tickMatch(state, MATCH_TICK_MS, baseState);
      expect(nextState.outcome).not.toBe('turnover-pass');
    }
  });

  it('pas d’interception si la passe est trop haute (z > 55)', () => {
    const baseState = buildState('pnr-central');
    baseState.activeInterceptionsEnabled = true;

    let state = createInitialMatchState(baseState, { seed: 42 });

    // Placer tous les défenseurs très loin
    (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
      state.defPos[id] = makeDef({ x: 9999, y: 9999, gazeOrientation: 0, matchedTo: 'O1' });
    });

    state.carrier = 'O1';
    state.off.O1 = { x: 200, y: 200 };
    // Augmentons la distance pour que la parabole monte haut (z > 55)
    state.off.O2 = { x: 600, y: 200 };
    state.intent = passIntent('O2', 0.5);

    state.defPos.D1 = makeDef({
      x: 400,
      y: 200,
      gazeOrientation: 90,
      matchedTo: 'O1',
    });

    // Même avec D1 sur la trajectoire, la balle passe à z > 55, donc pas d'interception
    for (let seed = 0; seed < 50; seed++) {
      state.seed = seed;
      state.intent = passIntent('O2', 0.5);
      state.outcome = null;
      
      const nextState = tickMatch(state, MATCH_TICK_MS, baseState);
      expect(nextState.outcome).not.toBe('turnover-pass');
    }
  });
});

describe('Physique du tir & rebonds (physicsReboundsEnabled)', () => {
  it('pré-calcule une trajectoire physique 3D et attribue le rebond au plus proche du landing spot', () => {
    const baseState = buildState('pnr-central');
    baseState.physicsReboundsEnabled = true;

    let state = createInitialMatchState(baseState, {
      seed: 42,
      shotClockMs: 2 * MATCH_TICK_MS, // Lâcher avant le signal
    });

    // Positionnons les joueurs
    state.off.O1 = { x: 200, y: 300 }; // Shooter
    state.off.O2 = { x: 280, y: 120 }; // Près du panier (x=300, y=75)
    state.defPos.D1 = makeDef({ x: 320, y: 120, matchedTo: 'O2' }); // Près du panier

    // Un tir décidé, lâché au prochain tick, explicitement raté :
    // le test de rebond ne dépend pas d'une recherche de seed.
    const shot = evaluateOffensiveOptions(state.off, state.defPos, state.carrier)
      .find((action) => action.type === 'shoot')!;
    state.intent = { kind: 'shoot', action: { ...shot, scoreProbability: 0 }, forced: true };
    const nextState = tickMatch(state, MATCH_TICK_MS, baseState);

    expect(nextState.outcome).toContain('missed');
    expect(nextState.shotPhysicalTrajectory).toBeDefined();
    expect(nextState.shotPhysicalTrajectory!.length).toBeGreaterThan(0);

    // Vérifier que la trajectoire commence près de O1 (x=200, y=300)
    const firstPoint = nextState.shotPhysicalTrajectory![0];
    expect(firstPoint.x).toBeCloseTo(200, 1);
    expect(firstPoint.y).toBeCloseTo(300, 1);

    // Vérifier qu'il y a un rebond calculé cohérent
    expect(nextState.pendingRebound).not.toBeNull();
    const landingPos = nextState.pendingRebound!.position;

    // Trouver le joueur le plus proche du landing spot attendu
    let expectedRebounder: AttackerId | DefenderId | null = null;
    let minD = Infinity;
    Object.entries(nextState.off).forEach(([id, p]) => {
      const d = Math.hypot(p.x - landingPos.x, p.y - landingPos.y);
      if (d < minD) {
        minD = d;
        expectedRebounder = id as AttackerId;
      }
    });
    Object.entries(nextState.defPos).forEach(([id, p]) => {
      const d = Math.hypot(p.x - landingPos.x, p.y - landingPos.y);
      if (d < minD) {
        minD = d;
        expectedRebounder = id as DefenderId;
      }
    });

    expect(nextState.pendingRebound!.rebounder).toBe(expectedRebounder);
  });
});
