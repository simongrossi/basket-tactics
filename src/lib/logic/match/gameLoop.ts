// Phase I — B1 : game loop autonome pour le mode "▶ Play IA (live)".
//
// Différence clé avec `aiPossession.generateAiPossessionPlan` :
//
// - `aiPossession` génère TOUTE une possession d'un coup (boucle synchrone)
//   et retourne un `Step[]` rejouable dans la timeline normale.
// - `gameLoop` simule une possession EN CONTINU, tick par tick (~5 Hz),
//   avec un shot clock en millisecondes. Conçu pour être appelé depuis
//   un `setInterval` côté UI et muter un état affiché en temps réel.
//
// V1 (B1) : décision à chaque tick, off-ball statique. Les coéquipiers
// du porteur bougent uniquement quand ils reçoivent une passe. B2
// améliorera avec des intent persistants (cuts / écrans permanents).
//
// V1 n'utilise pas l'engine `effectiveDefensePositions` à chaque tick
// (coût CPU à 5 Hz × 5 défenseurs) : on lit la défense une fois au
// début de chaque "décision" et on la garde stable pendant l'action.
// Quand une action mute les positions offensives de façon significative,
// la défense est recomputée.
//
// Découpe 2026-06-11 (refacto bit-identique, pattern barrel + dossier) —
// ce fichier reste le POINT D'ENTRÉE PUBLIC (factory + tick + ré-exports),
// la logique vit dans `gameLoop/` :
//   - `gameLoop/constants.ts`      — toutes les constantes de tuning
//   - `gameLoop/types.ts`          — MatchState, CarrierIntent, TeamStats, options
//   - `gameLoop/helpers.ts`        — clones, refreshDefense, box-out targets
//   - `gameLoop/possessionFlow.ts` — pause de transition + branchage rebond/possession
//   - `gameLoop/awayPossession.ts` — possession adverse (Phase 2 + stub legacy)
//   - `gameLoop/carrierActions.ts` — décision EV, drive, passe, tir forcé
//   - `gameLoop/shotResolution.ts` — resolveShot + trajectoire physique 3D

import type { AppState } from '@/lib/types';
import { activeBallCarrier, activeOffense } from '../players';
import { effectiveDefensePositions, getDefenseHoop } from '../engine';
import { seededAiRng } from './aiPossession';
import {
  DECISION_INTERVAL_TICKS,
  advanceOffBallIntents,
  decideOffBallIntents,
} from './decisions/offBallMover';
import { advanceBallAdvance } from './ballAdvance';
import { HALF_COURT_Y } from '../awayPossessionSetup';
import {
  DEFAULT_CREATIVITY,
  DEFAULT_SHOT_CLOCK_MS,
  INBOUND_TIMER_MS,
} from './gameLoop/constants';
import {
  emptyTeamStats,
  type CreateMatchStateOptions,
  type MatchState,
  type TickMatchOptions,
} from './gameLoop/types';
import { cloneDef, cloneOff } from './gameLoop/helpers';
import { handleTransitionPause, isSessionDone } from './gameLoop/possessionFlow';
import { advanceAwayPossession } from './gameLoop/awayPossession';
import {
  advanceDrive,
  advancePass,
  decideNextAction,
} from './gameLoop/carrierActions';
import { resolveShot } from './gameLoop/shotResolution';

// ============================================================
// API publique — ré-exports (callers historiques inchangés)
// ============================================================

export { MATCH_TICK_MS } from './gameLoop/constants';
export type {
  CarrierIntent,
  CreateMatchStateOptions,
  MatchState,
  TeamStats,
  TickMatchOptions,
} from './gameLoop/types';

// ============================================================
// Factory : état initial
// ============================================================

export function createInitialMatchState(
  state: AppState,
  options: CreateMatchStateOptions = {}
): MatchState {
  const seed = options.seed ?? Date.now();
  const shotClockMs = options.shotClockMs ?? DEFAULT_SHOT_CLOCK_MS;
  const possession = options.possession ?? 1;
  const step = state.steps[state.activeStep];
  if (!step) {
    throw new Error('createInitialMatchState: state.activeStep ne pointe sur aucun step');
  }
  const off = activeOffense(step.off, state.playerCount);
  const carrier = activeBallCarrier(step, state.playerCount);
  const defPos = effectiveDefensePositions(state, state.activeStep);
  const carrierPos = off[carrier] ?? { x: 0, y: 0 };
  // Si le step actif est une remise en jeu, on initialise le timer 5s.
  const ctx = step.context;
  const isInbound =
    ctx === 'inbound-baseline' ||
    ctx === 'inbound-sideline-low' ||
    ctx === 'inbound-sideline-high';
  return {
    off: cloneOff(off),
    defPos: cloneDef(defPos),
    carrier,
    ballPos: { x: carrierPos.x + 16, y: carrierPos.y - 16 },
    shotClockMs,
    possessionTimeMs: 0,
    tickCount: 0,
    intent: { kind: 'idle' },
    offBallIntents: {},
    score: 0,
    outcome: null,
    eventLog: [],
    seed,
    possession,
    cumulativeScore: 0,
    homeScore: 0,
    awayScore: 0,
    attackingTeam: 'home',
    possessionsPlayed: 0,
    maxPossessions: options.maxPossessions ?? null,
    transitionStartedAtMs: null,
    inboundTimerMs: isInbound ? INBOUND_TIMER_MS : null,
    boxOutTargets: null,
    boxOutStartedAtMs: null,
    pendingRebound: null,
    shotBallStartPos: null,
    shotPhysicalTrajectory: null,
    awayBallPos: null,
    awayPlayerPositions: null,
    teamStats: { home: emptyTeamStats(), away: emptyTeamStats() },
  };
}

// ============================================================
// Tick — un pas de simulation
// ============================================================

/**
 * Avance la game loop de `dtMs` ms. Retourne un NOUVEL état (immutable).
 *
 * Appelé en boucle par `useMatchLoop` côté React via `setInterval(MATCH_TICK_MS)`.
 *
 * Algorithme V1 :
 *   1. Si possession déjà terminée → no-op.
 *   2. Décrémente le shot clock. Si ≤ 0 sans tir lâché → violation.
 *   3. Si intent courant en cours (drive/pass non terminé), continuer.
 *   4. Sinon, décider la prochaine action (réutilise `evaluateOffensiveOptions`
 *      + softmax pondéré par `creativity`).
 *   5. Appliquer l'action (mute positions, log événement).
 *   6. Si tir, résoudre l'outcome et terminer.
 */
export function tickMatch(
  matchState: MatchState,
  dtMs: number,
  baseAppState: AppState,
  options: TickMatchOptions = {}
): MatchState {
  // B3b — session terminée (maxPossessions atteint) : no-op.
  if (isSessionDone(matchState)) return matchState;
  // B3b — possession terminée mais session non finie : pause de transition
  // puis off-rebound ou nouvelle possession.
  if (matchState.outcome !== null) {
    return handleTransitionPause(matchState, dtMs, baseAppState, options);
  }
  const creativity = options.creativity ?? DEFAULT_CREATIVITY;
  const rng = seededAiRng(matchState.seed + matchState.tickCount);
  const next: MatchState = {
    ...matchState,
    off: cloneOff(matchState.off),
    defPos: cloneDef(matchState.defPos),
    ballPos: { ...matchState.ballPos },
    eventLog: [...matchState.eventLog],
    offBallIntents: { ...matchState.offBallIntents },
    tickCount: matchState.tickCount + 1,
    possessionTimeMs: matchState.possessionTimeMs + dtMs,
    shotClockMs: Math.max(0, matchState.shotClockMs - dtMs),
    inboundTimerMs:
      matchState.inboundTimerMs !== null
        ? Math.max(0, matchState.inboundTimerMs - dtMs)
        : null,
  };

  // Timer 5s de remise expiré → violation, turnover.
  // Phase 1.1 — En possession away, l'inbound est purement cosmétique
  // (stub) : pas de violation possible. Le timer est désarmé par
  // advanceAwayPossession après ~3s pour basculer sur l'animation stub.
  if (
    matchState.inboundTimerMs !== null &&
    next.inboundTimerMs === 0 &&
    next.attackingTeam !== 'away'
  ) {
    next.outcome = 'turnover-pass';
    next.eventLog.push({
      possession: next.possession,
      clock: next.shotClockMs / 1000,
      actor: next.carrier,
      type: 'turnover',
      label: `⚠ Violation 5s remise — ${next.carrier} perd la balle`,
    });
    next.intent = { kind: 'idle' };
    // Phase 1.4 — Compte le turnover sur l'équipe qui inboundait.
    next.teamStats = {
      ...next.teamStats,
      [next.attackingTeam]: {
        ...next.teamStats[next.attackingTeam],
        turnovers: next.teamStats[next.attackingTeam].turnovers + 1,
      },
    };
    return next;
  }

  // B2 — décideur off-ball : (re)évalué tous les DECISION_INTERVAL_TICKS
  // ticks. Cuts en cours conservés (jamais annulés à mi-chemin). Drift
  // décidé en fonction de la distance au slot idéal.
  if (next.tickCount % DECISION_INTERVAL_TICKS === 0) {
    next.offBallIntents = decideOffBallIntents({
      off: next.off,
      defPos: next.defPos,
      carrier: next.carrier,
      hoop: getDefenseHoop(baseAppState, next.attackingTeam),
      rng,
      currentIntents: next.offBallIntents,
      attackerProfiles: baseAppState.attackerProfiles,
    });
  }
  // B2 — chaque tick, on avance les positions off-ball selon leur intent.
  // Mute `next.off` en place (avec push-out anti-overlap entre coéquipiers).
  const advanced = advanceOffBallIntents({
    off: next.off,
    intents: next.offBallIntents,
    hoop: getDefenseHoop(baseAppState, next.attackingTeam),
  });
  next.off = advanced.off;
  next.offBallIntents = advanced.intents;

  // Un intent « shoot » n'est pas un lâcher : il attend encore sa résolution.
  // Les tirs déjà lâchés ont un outcome et passent par handleTransitionPause.
  if (next.shotClockMs === 0 && next.intent.kind !== 'away-possession') {
    next.outcome = 'turnover-clock';
    next.score = 0;
    next.intent = { kind: 'idle' };
    next.eventLog.push({
      possession: next.possession, clock: 0, actor: next.carrier,
      type: 'turnover', label: 'Violation du temps de possession — ballon non lâché avant le signal',
    });
    next.teamStats = {
      ...next.teamStats,
      [next.attackingTeam]: {
        ...next.teamStats[next.attackingTeam],
        turnovers: next.teamStats[next.attackingTeam].turnovers + 1,
      },
    };
    return next;
  }

  // E.1 V1 — possession adverse stubbée : on décrémente le clock,
  // pas de décision côté maison, outcome au bout du timer.
  if (next.intent.kind === 'away-possession') {
    return advanceAwayPossession(next, dtMs, baseAppState, rng, options.awayScoreOverride);
  }
  // Si intent en cours, le faire avancer.
  if (next.intent.kind === 'drive') {
    return advanceDrive(next, dtMs, baseAppState);
  }
  if (next.intent.kind === 'pass') {
    return advancePass(next, dtMs, baseAppState);
  }
  // Drive arrivé à destination → intent 'shoot' posté au tick précédent.
  // On résout le tir maintenant. Sans ce handler explicite, l'intent
  // 'shoot' tomberait dans decideNextAction et perdrait l'action stockée.
  if (next.intent.kind === 'shoot') {
    return resolveShot(next, next.intent.action, rng, next.intent.forced, baseAppState);
  }

  // Phase 1.2 — Montée de balle en cours : drive vers la médiane.
  if (next.intent.kind === 'advance') {
    return advanceBallAdvance(next, dtMs, baseAppState);
  }

  // Phase 1.2 — Si le porteur home est en backcourt sans intent et que
  // l'inbound est déjà fait (passe rentrante effectuée), démarrer la
  // montée de balle (intent advance, timer 8s FIBA).
  const carrierPos = next.off[next.carrier];
  if (
    next.attackingTeam === 'home' &&
    next.intent.kind === 'idle' &&
    next.inboundTimerMs === null &&
    carrierPos &&
    carrierPos.y > HALF_COURT_Y
  ) {
    next.intent = {
      kind: 'advance',
      targetY: HALF_COURT_Y - 20, // léger buffer pour bien franchir
      advanceTimerMs: 8_000,
    };
    return advanceBallAdvance(next, dtMs, baseAppState);
  }

  // Pas d'intent : décider la prochaine action.
  const action = decideNextAction(next, baseAppState, rng, creativity);
  if (!action) {
    next.outcome = 'empty';
    return next;
  }

  // Appliquer l'action choisie.
  if (action.type === 'shoot') {
    return resolveShot(next, action, rng, false, baseAppState);
  }
  if (action.type === 'drive') {
    next.intent = {
      kind: 'drive',
      target: action.shotPos,
      expectedAction: action,
      // 2b.1 — position de départ du drive : sert de carrierPrev au
      // containment (progression cumulée, pas le grain 8 px/tick).
      startPos: carrierPos ? { x: carrierPos.x, y: carrierPos.y } : undefined,
    };
    return advanceDrive(next, dtMs, baseAppState);
  }
  if (action.type === 'pass-shoot' && action.targetId) {
    next.intent = {
      kind: 'pass',
      receiver: action.targetId,
      progress: 0,
      expectedAction: action,
    };
    // Remise en jeu : la passe rentrante a démarré, on désarme le
    // timer 5s (plus de violation possible).
    next.inboundTimerMs = null;
    return advancePass(next, dtMs, baseAppState);
  }
  return next;
}
