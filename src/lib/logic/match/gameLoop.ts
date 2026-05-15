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

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
  Step,
} from '@/lib/types';
import { activeBallCarrier, activeOffense } from '../players';
import { effectiveDefensePositions, getDefenseHoop } from '../engine';
import {
  evaluateOffensiveOptions,
  nearestDefenderDistance,
  type OffensiveAction,
} from '../offense';
import { shotZoneFor, type ShotZone } from '../threats';
import { distance } from '../geometry';
import {
  seededAiRng,
} from './aiPossession';
import type {
  AiPossessionEvent,
  AiPossessionOutcome,
} from './aiPossession';
import {
  DECISION_INTERVAL_TICKS,
  advanceOffBallIntents,
  decideOffBallIntents,
  triggerRelocateAfterPass,
  type OffBallIntents,
} from './decisions/offBallMover';
import { computeRebound, type ReboundResult } from './rebound';

// ============================================================
// Constantes
// ============================================================

/** Cadence du tick — 30 Hz / 33 ms, alignée sur `usePlaybackAnimation`.
 *  Donne une animation fluide (60 fps via setInterval est dur sans rAF).
 *  La cadence DÉCISIONNELLE (= quand l'IA choisit une nouvelle action)
 *  est plus basse : carrier en idle décide à chaque tick (≈ instantané
 *  dès qu'il termine l'action courante), off-ball décide tous les
 *  `DECISION_INTERVAL_TICKS` ticks (~1 s).
 *
 *  Note historique : 200 ms (5 Hz) à l'origine — trop lent visuellement,
 *  l'utilisateur voyait 5 images/s, saccadé. Bump à 30 Hz avec scaling
 *  proportionnel des constantes de vitesse / intervalle. */
export const MATCH_TICK_MS = 33;

/** Shot clock initial en millisecondes. Surchargeable via options. */
const DEFAULT_SHOT_CLOCK_MS = 24_000;

/** Reset shot clock après rebond offensif. NBA FIBA = 14 s. */
const OFFENSIVE_REBOUND_SHOT_CLOCK_MS = 14_000;

/** Seuil "low clock" où on force le tir si on a une option. */
const LOW_CLOCK_MS = 4_500;

/** B3b — pause après fin de possession avant transition. Permet au HUD
 *  d'afficher l'outcome ("tir réussi", "perte", etc.) avant de relancer
 *  la possession suivante. 1.5 s = lisible sans casser le rythme. */
const TRANSITION_PAUSE_MS = 1_500;

/** B3b — probabilité de rebond offensif sur tir manqué. Stub très simple
 *  basé sur stats moyennes NBA (~25-28 %). Conservé pour rétrocompat
 *  des tests, mais E.1 V1 remplace par un modèle géométrique. */
const DEFAULT_OFFENSIVE_REBOUND_RATE = 0.28;

/** Phase E.1 V1 — paramètres de la possession adverse stubbée.
 *  Sur rebond défensif, on simule l'équipe adverse qui attaque sans
 *  rendu visuel : le shot clock tourne, puis on tire au sort un outcome. */
const AWAY_POSSESSION_DURATION_MS = 12_000;
/** Proba de score sur la possession adverse stubbée. 50 % × 2 pts =
 *  1.0 PPP adverse (en-dessous de la moyenne NBA ~1.1 mais assumée
 *  comme stub — on calibrera en V2 si nécessaire). */
const AWAY_SCORE_PROBABILITY = 0.5;
/** Décalage de box-out : chaque défenseur shift vers son matched
 *  attaquant + offset panier. Visuel pendant la résolution du tir. */
const BOXOUT_OFFSET_PX = 18;

/** Vitesse max du porteur en px/tick. À 30 Hz et 8 px/tick = 240 px/s
 *  ≈ 6.5 m/s, sprint réaliste basket. Avant : 50 px à 5 Hz (même vitesse,
 *  mais saut visible par image). */
const MAX_CARRIER_STEP_PX = 8;

const DEFAULT_CREATIVITY = 0.35;

/** B3a — seuil de contestation. Un défenseur à ≤ CONTEST_THRESHOLD_PX
 *  du tireur compte le tir comme "contesté". Aligné avec
 *  `contestMultiplier` dans `offense.ts` (palier à 80 px).
 *  À 30 px (~80 cm), c'est une vraie main au visage du shooter. */
const CONTEST_THRESHOLD_PX = 30;

/** Labels FR par zone de tir pour les events lisibles côté HUD. */
const SHOT_ZONE_LABELS: Record<ShotZone, string> = {
  rim: 'au cercle',
  paint: 'dans la raquette',
  mid: 'à mi-distance',
  three: 'à 3 pts',
  deep: 'longue distance',
};

// ============================================================
// Types
// ============================================================

/** Intent en cours pour le porteur. Persiste entre ticks tant que
 *  l'action n'est pas terminée.
 *
 *  Phase E.1 V1 : ajout de `away-possession` pour modéliser le stub de
 *  possession adverse (shot clock tourne, pas de rendu, outcome au
 *  bout de AWAY_POSSESSION_DURATION_MS). */
export type CarrierIntent =
  | { kind: 'idle' }
  | { kind: 'drive'; target: Point; expectedAction: OffensiveAction }
  | { kind: 'pass'; receiver: AttackerId; progress: number; expectedAction: OffensiveAction }
  | { kind: 'shoot'; action: OffensiveAction; forced: boolean }
  | { kind: 'away-possession'; remainingMs: number };

/** État live d'une possession simulée par la game loop.
 *  Mutable (par tick) — pas dans `AppState` (transient UI). */
export interface MatchState {
  /** Positions courantes des 5 attaquants (mute par tick). */
  off: AttackerPositions;
  /** Positions courantes des 5 défenseurs (recomputées sur décision). */
  defPos: ComputedDefense;
  /** Porteur du ballon courant. */
  carrier: AttackerId;
  /** Position visuelle de la balle (suit porteur ou interpole pendant passe). */
  ballPos: Point;
  /** Shot clock restant en ms. */
  shotClockMs: number;
  /** Temps écoulé total depuis le début de la possession (ms). */
  possessionTimeMs: number;
  /** Nombre de ticks exécutés. */
  tickCount: number;
  /** Intent courant du porteur. */
  intent: CarrierIntent;
  /** Intents par off-ball (= non-carriers). Décidés tous les
   *  `DECISION_INTERVAL_TICKS` ticks, avancés à chaque tick. */
  offBallIntents: OffBallIntents;
  /** Score de la possession COURANTE (0/2/3) si terminée, sinon 0.
   *  Pour le score cumulé sur la session multi-possessions, voir
   *  `cumulativeScore`. */
  score: number;
  /** Outcome final si la possession est terminée, sinon `null` (= en cours). */
  outcome: AiPossessionOutcome | null;
  /** B3b — score cumulé sur toute la session (toutes possessions confondues).
   *  Phase E.1 V1 : alias historique pour `homeScore`. Maintenu pour
   *  rétrocompat (UI / tests existants). */
  cumulativeScore: number;
  /** Phase E.1 V1 — score domicile (notre équipe attaquante). */
  homeScore: number;
  /** Phase E.1 V1 — score visiteur (l'adversaire stub). */
  awayScore: number;
  /** Phase E.1 V1 — équipe qui attaque actuellement. Bascule sur rebond
   *  défensif, revient sur fin de possession adverse. */
  attackingTeam: 'home' | 'away';
  /** B3b — nombre de possessions terminées (= 0 si encore dans la 1ère). */
  possessionsPlayed: number;
  /** B3b — limite de possessions pour cette session. `null` = endless,
   *  l'utilisateur stoppe manuellement. */
  maxPossessions: number | null;
  /** B3b — timestamp ms du début de la pause de transition. Null si
   *  on est en possession active. Quand non-null et que `TRANSITION_PAUSE_MS`
   *  s'est écoulé, on déclenche la transition (rebond off ou new possession). */
  transitionStartedAtMs: number | null;
  /** Journal des événements typés pour debug + UI (HUD live). */
  eventLog: AiPossessionEvent[];
  /** Seed RNG utilisée (pour replay). */
  seed: number;
  /** Numéro de possession (1-indexé, pour multi-possessions futures). */
  possession: number;
}

export interface CreateMatchStateOptions {
  /** Seed pour la RNG. Default : Date.now(). */
  seed?: number;
  /** Shot clock initial en ms. Default : 24 000 (= 24 s FIBA). */
  shotClockMs?: number;
  /** Numéro de possession. Default : 1. */
  possession?: number;
  /** B3b — limite de possessions pour cette session. `null` ou
   *  undefined = endless (l'utilisateur stoppe manuellement). */
  maxPossessions?: number | null;
}

export interface TickMatchOptions {
  /** Créativité (0..1) qui module la "température" softmax de la
   *  sélection d'action. Default : 0.35 (légère variance vs meilleure EV). */
  creativity?: number;
  /** B3b — probabilité de rebond offensif sur tir manqué. Default 28 %.
   *  Surchargeable pour tests / scénarios où on veut forcer l'un ou l'autre. */
  offensiveReboundRate?: number;
}

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
 *   2. Décrémente le shot clock. Si ≤ 0 → forced shot.
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
  };

  // B2 — décideur off-ball : (re)évalué tous les DECISION_INTERVAL_TICKS
  // ticks. Cuts en cours conservés (jamais annulés à mi-chemin). Drift
  // décidé en fonction de la distance au slot idéal.
  if (next.tickCount % DECISION_INTERVAL_TICKS === 0) {
    next.offBallIntents = decideOffBallIntents({
      off: next.off,
      defPos: next.defPos,
      carrier: next.carrier,
      hoop: getDefenseHoop(baseAppState),
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
    hoop: getDefenseHoop(baseAppState),
  });
  next.off = advanced.off;
  next.offBallIntents = advanced.intents;

  // Shot clock expiré : forced shot sur l'action shoot disponible (ou tir
  // forcé à 0 % si rien d'utile).
  if (next.shotClockMs === 0 && next.intent.kind !== 'shoot') {
    const action = pickForcedShot(next, baseAppState);
    return resolveShot(next, action, rng, true, baseAppState);
  }

  // E.1 V1 — possession adverse stubbée : on décrémente le clock,
  // pas de décision côté maison, outcome au bout du timer.
  if (next.intent.kind === 'away-possession') {
    return advanceAwayPossession(next, dtMs, baseAppState, rng);
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
    next.intent = { kind: 'drive', target: action.shotPos, expectedAction: action };
    return advanceDrive(next, dtMs, baseAppState);
  }
  if (action.type === 'pass-shoot' && action.targetId) {
    next.intent = {
      kind: 'pass',
      receiver: action.targetId,
      progress: 0,
      expectedAction: action,
    };
    return advancePass(next, dtMs, baseAppState);
  }
  return next;
}

// ============================================================
// B3b — transition entre possessions (rebond off ou new possession)
// ============================================================

function isSessionDone(state: MatchState): boolean {
  // Session terminée = possession finie ET on a atteint maxPossessions.
  // (Si maxPossessions === null = endless, jamais "done" sans stop manuel.)
  if (state.outcome === null) return false;
  if (state.maxPossessions === null) return false;
  return state.possessionsPlayed >= state.maxPossessions;
}

function handleTransitionPause(
  state: MatchState,
  dtMs: number,
  baseAppState: AppState,
  options: TickMatchOptions
): MatchState {
  // On laisse le temps avancer pendant la pause (pour que l'utilisateur
  // voie l'outcome avant de redémarrer). Compte aussi le tick.
  const next: MatchState = {
    ...state,
    off: cloneOff(state.off),
    defPos: cloneDef(state.defPos),
    ballPos: { ...state.ballPos },
    eventLog: [...state.eventLog],
    offBallIntents: { ...state.offBallIntents },
    tickCount: state.tickCount + 1,
    possessionTimeMs: state.possessionTimeMs + dtMs,
  };

  // Démarrage de la pause : mémoriser le start time côté possession.
  if (next.transitionStartedAtMs === null) {
    next.transitionStartedAtMs = next.possessionTimeMs;
    return next;
  }

  const elapsed = next.possessionTimeMs - next.transitionStartedAtMs;
  if (elapsed < TRANSITION_PAUSE_MS) {
    return next; // toujours en pause
  }

  // Pause terminée → résoudre la transition.
  return executeTransition(next, baseAppState, options);
}

function executeTransition(
  state: MatchState,
  baseAppState: AppState,
  options: TickMatchOptions
): MatchState {
  const isMissedShot =
    state.outcome === 'shot-missed' || state.outcome === 'forced-shot-missed';
  const rng = seededAiRng(state.seed + state.tickCount + state.possession * 1000);

  // Cumule le score de cette possession sur le bon côté.
  const homeScore = state.homeScore + (state.attackingTeam === 'home' ? state.score : 0);
  const awayScore = state.awayScore + (state.attackingTeam === 'away' ? state.score : 0);
  const cumulativeScore = homeScore; // alias rétrocompat

  // On évalue le rebond ICI (mode E.1 V1) pour savoir si la possession
  // se termine ou continue (rebond offensif = même possession).
  const reboundRateOverride = options.offensiveReboundRate;
  let rebound: ReboundResult | null = null;
  let offensiveReboundDecided = false;
  if (isMissedShot) {
    if (reboundRateOverride !== undefined) {
      offensiveReboundDecided = rng() < reboundRateOverride;
    } else {
      const hoop = getDefenseHoop(baseAppState);
      const shotEvent = [...state.eventLog].reverse().find(
        (e) => e.type === 'shot' || e.type === 'forced-shot'
      );
      const shotPos = shotEvent?.shotPos ?? state.off[state.carrier] ?? hoop;
      rebound = computeRebound({
        off: state.off,
        defPos: state.defPos,
        hoop,
        shotPos,
        attackerProfiles: baseAppState.attackerProfiles,
        shooter: state.carrier,
        rng,
      });
      offensiveReboundDecided = rebound.type === 'offensive';
    }
  }

  // `possessionsPlayed` ne compte que les possessions maison TERMINÉES.
  // Un rebond offensif continue la même possession (pas d'incrément).
  // Une possession adverse stubbée n'incrémente pas non plus (= notre
  // possession maison ne change pas de "numéro" pendant l'aller-retour
  // adverse).
  const possessionContinues = offensiveReboundDecided;
  const homeEnded = state.attackingTeam === 'home' && !possessionContinues;
  const nextPossessionsPlayed = homeEnded
    ? state.possessionsPlayed + 1
    : state.possessionsPlayed;

  // Session terminée → fige sans transition. L'outcome reste set, donc
  // isSessionDone() retournera true au tick suivant et le tick devient
  // no-op strict.
  if (
    state.maxPossessions !== null &&
    nextPossessionsPlayed >= state.maxPossessions
  ) {
    return {
      ...state,
      cumulativeScore,
      homeScore,
      awayScore,
      possessionsPlayed: nextPossessionsPlayed,
      transitionStartedAtMs: null,
    };
  }

  const stateForTransition: MatchState = {
    ...state,
    possessionsPlayed: nextPossessionsPlayed,
  };

  // Branchage final selon le résultat du rebond / type d'outcome.
  if (isMissedShot) {
    if (offensiveReboundDecided) {
      return continueWithOffensiveRebound(
        stateForTransition,
        cumulativeScore,
        baseAppState,
        homeScore,
        awayScore,
        rebound
      );
    }
    // Pas de rebond offensif :
    if (reboundRateOverride !== undefined) {
      // Mode legacy B3b : nouvelle possession maison directe.
      return startFreshPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore);
    }
    // Mode E.1 V1 : rebond défensif → possession adverse stubbée.
    return startAwayPossession(stateForTransition, cumulativeScore, homeScore, awayScore, rebound);
  }

  // Tir réussi / turnover / forced shot manqué sans rebond off →
  // possession adverse (l'adversaire récupère la balle).
  if (state.attackingTeam === 'home') {
    return startAwayPossession(stateForTransition, cumulativeScore, homeScore, awayScore, null);
  }
  // Sinon (fin de possession adverse) : nouvelle possession maison.
  return startFreshPossession(stateForTransition, baseAppState, cumulativeScore, homeScore, awayScore);
}

function continueWithOffensiveRebound(
  state: MatchState,
  cumulativeScore: number,
  baseAppState: AppState,
  homeScore: number = cumulativeScore,
  awayScore: number = state.awayScore,
  rebound?: ReboundResult | null
): MatchState {
  const hoop = getDefenseHoop(baseAppState);
  // E.1 V1 — si rebond fourni et qu'il pointe vers un attaquant, on
  // l'utilise. Sinon (B3b legacy) : fallback heuristique = off-ball
  // le plus proche du panier.
  const shooter = state.carrier;
  let newCarrier: AttackerId;
  if (
    rebound &&
    rebound.type === 'offensive' &&
    rebound.rebounder &&
    rebound.rebounder.startsWith('O')
  ) {
    newCarrier = rebound.rebounder as AttackerId;
  } else {
    let best: AttackerId | null = null;
    let bestDist = Infinity;
    (Object.keys(state.off) as AttackerId[]).forEach((id) => {
      if (id === shooter) return;
      const p = state.off[id];
      if (!p) return;
      const d = Math.hypot(p.x - hoop.x, p.y - hoop.y);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    });
    newCarrier = best ?? shooter;
  }
  const carrierPos = state.off[newCarrier];

  // Event log : marque le rebond pour le HUD.
  const eventLog = [
    ...state.eventLog,
    {
      possession: state.possession,
      clock: OFFENSIVE_REBOUND_SHOT_CLOCK_MS / 1000,
      actor: newCarrier,
      type: 'pass' as const, // type le plus proche sémantiquement (pas de 'rebound' enum)
      label: `Rebond offensif ${newCarrier} (continue)`,
    },
  ];

  return {
    ...state,
    carrier: newCarrier,
    ballPos: carrierPos ? { x: carrierPos.x + 16, y: carrierPos.y - 16 } : state.ballPos,
    shotClockMs: OFFENSIVE_REBOUND_SHOT_CLOCK_MS,
    score: 0,
    outcome: null,
    intent: { kind: 'idle' },
    offBallIntents: {},
    eventLog,
    cumulativeScore,
    homeScore,
    awayScore,
    // possessionsPlayed inchangé (= même possession qui continue)
    // possession ID inchangé
    transitionStartedAtMs: null,
  };
}

function startFreshPossession(
  state: MatchState,
  baseAppState: AppState,
  cumulativeScore: number,
  homeScore: number = cumulativeScore,
  awayScore: number = state.awayScore
): MatchState {
  // Repart de l'étape de base (positions "home"). Incrémente compteur.
  const step = baseAppState.steps[baseAppState.activeStep];
  if (!step) {
    // Cas dégénéré : on stoppe.
    return { ...state, cumulativeScore, possessionsPlayed: state.possessionsPlayed + 1 };
  }
  const off = activeOffense(step.off, baseAppState.playerCount);
  const carrier = activeBallCarrier(step, baseAppState.playerCount);
  const defPos = effectiveDefensePositions(baseAppState, baseAppState.activeStep);
  const carrierPos = off[carrier] ?? { x: 0, y: 0 };
  const newPossession = state.possession + 1;
  // possessionsPlayed déjà incrémenté dans executeTransition (E.1 V1).

  const eventLog = [
    ...state.eventLog,
    {
      possession: newPossession,
      clock: DEFAULT_SHOT_CLOCK_MS / 1000,
      actor: carrier,
      type: 'pass' as const,
      label: `— Nouvelle possession #${newPossession} —`,
    },
  ];

  return {
    ...state,
    off: cloneOff(off),
    defPos: cloneDef(defPos),
    carrier,
    ballPos: { x: carrierPos.x + 16, y: carrierPos.y - 16 },
    shotClockMs: DEFAULT_SHOT_CLOCK_MS,
    possessionTimeMs: 0,
    intent: { kind: 'idle' },
    offBallIntents: {},
    score: 0,
    outcome: null,
    eventLog,
    cumulativeScore,
    homeScore,
    awayScore,
    attackingTeam: 'home',
    possession: newPossession,
    transitionStartedAtMs: null,
  };
}

// ============================================================
// E.1 V1 — possession adverse stubbée
// ============================================================

/**
 * Démarre une possession adverse stubbée. L'adversaire n'est pas rendu
 * visuellement : les positions de notre équipe restent figées (utiles
 * pour le rebond défensif visible), le shot clock tourne pendant
 * `AWAY_POSSESSION_DURATION_MS`, puis outcome aléatoire au bout du
 * timer (AWAY_SCORE_PROBABILITY × 2 pts).
 */
function startAwayPossession(
  state: MatchState,
  cumulativeScore: number,
  homeScore: number,
  awayScore: number,
  rebound: ReboundResult | null
): MatchState {
  // possessionsPlayed déjà incrémenté dans executeTransition.
  const reboundLabel = rebound?.rebounder
    ? `Rebond défensif ${rebound.rebounder}`
    : "Fin de possession maison — transition adverse";
  const eventLog = [
    ...state.eventLog,
    {
      possession: state.possession,
      clock: state.shotClockMs / 1000,
      actor: state.carrier,
      type: 'pass' as const,
      label: reboundLabel,
    },
  ];
  return {
    ...state,
    score: 0,
    outcome: null,
    intent: { kind: 'away-possession', remainingMs: AWAY_POSSESSION_DURATION_MS },
    offBallIntents: {},
    eventLog,
    cumulativeScore,
    homeScore,
    awayScore,
    attackingTeam: 'away',
    transitionStartedAtMs: null,
    // Shot clock visible côté adverse : on initialise à la durée de la
    // possession adverse pour que le countdown soit lisible.
    shotClockMs: AWAY_POSSESSION_DURATION_MS,
    possessionTimeMs: 0,
  };
}

/**
 * Avance la possession adverse stubbée. Décrémente le timer, et quand
 * il atteint 0, tire au sort l'outcome (score ou non), met à jour
 * `awayScore`, puis enchaîne sur une possession maison.
 */
function advanceAwayPossession(
  state: MatchState,
  dtMs: number,
  baseAppState: AppState,
  rng: () => number
): MatchState {
  if (state.intent.kind !== 'away-possession') return state;
  const remaining = state.intent.remainingMs - dtMs;
  if (remaining > 0) {
    return {
      ...state,
      intent: { kind: 'away-possession', remainingMs: remaining },
      shotClockMs: Math.max(0, remaining),
    };
  }
  // Possession adverse terminée : outcome.
  const made = rng() < AWAY_SCORE_PROBABILITY;
  const pts = made ? 2 : 0;
  const newAwayScore = state.awayScore + pts;
  const eventLog = [
    ...state.eventLog,
    {
      possession: state.possession,
      clock: 0,
      actor: state.carrier,
      type: 'shot' as const,
      label: made ? `Adversaire +${pts} pts` : 'Adversaire — tir manqué',
      points: pts,
    },
  ];
  // Enchaîne directement sur une nouvelle possession maison.
  const step = baseAppState.steps[baseAppState.activeStep];
  if (!step) {
    return {
      ...state,
      awayScore: newAwayScore,
      intent: { kind: 'idle' },
      attackingTeam: 'home',
      eventLog,
    };
  }
  const off = activeOffense(step.off, baseAppState.playerCount);
  const carrier = activeBallCarrier(step, baseAppState.playerCount);
  const defPos = effectiveDefensePositions(baseAppState, baseAppState.activeStep);
  const carrierPos = off[carrier] ?? { x: 0, y: 0 };
  const newPossession = state.possession + 1;
  return {
    ...state,
    off: cloneOff(off),
    defPos: cloneDef(defPos),
    carrier,
    ballPos: { x: carrierPos.x + 16, y: carrierPos.y - 16 },
    shotClockMs: DEFAULT_SHOT_CLOCK_MS,
    possessionTimeMs: 0,
    intent: { kind: 'idle' },
    offBallIntents: {},
    score: 0,
    outcome: null,
    eventLog,
    awayScore: newAwayScore,
    attackingTeam: 'home',
    possession: newPossession,
    // possessionsPlayed déjà incrémenté au startAwayPossession (fin de
    // la possession maison précédente). Ici on démarre juste la suivante.
    transitionStartedAtMs: null,
  };
}

// ============================================================
// Helpers internes
// ============================================================

function decideNextAction(
  state: MatchState,
  baseAppState: AppState,
  rng: () => number,
  creativity: number
): OffensiveAction | null {
  const hoop = getDefenseHoop(baseAppState);
  const defAsPoints: Record<DefenderId, Point> = {} as Record<DefenderId, Point>;
  (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
    defAsPoints[id] = { x: state.defPos[id].x, y: state.defPos[id].y };
  });
  const actions = evaluateOffensiveOptions(
    state.off,
    state.defPos,
    state.carrier,
    hoop,
    baseAppState.attackerProfiles,
  );
  if (actions.length === 0) return null;
  return pickActionByEv(actions, rng, creativity);
}

function pickActionByEv(
  actions: OffensiveAction[],
  rng: () => number,
  creativity: number
): OffensiveAction {
  if (actions.length === 1 || creativity <= 0) return actions[0];
  const temperature = Math.max(0.08, 0.18 + creativity * 0.45);
  const weights = actions.map((a) => Math.exp(a.expectedPoints / temperature));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < actions.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return actions[i];
  }
  return actions[0];
}

function pickForcedShot(state: MatchState, baseAppState: AppState): OffensiveAction {
  const hoop = getDefenseHoop(baseAppState);
  const actions = evaluateOffensiveOptions(
    state.off,
    state.defPos,
    state.carrier,
    hoop,
    baseAppState.attackerProfiles,
  );
  const shootable = actions.find((a) => a.type === 'shoot');
  if (shootable) return shootable;
  if (actions[0]) return actions[0];
  // Aucune option viable (cas pathologique) : on fabrique un tir forcé
  // à 10 % depuis la position courante. Évite de crasher la loop.
  return {
    type: 'shoot',
    shotPos: state.off[state.carrier] ?? { x: 0, y: 0 },
    expectedPoints: 0.2,
    successRate: 0.1,
    scoreProbability: 0.1,
    shotPoints: 2,
    label: 'tir forcé (aucune option)',
  };
}

function advanceDrive(
  state: MatchState,
  _dtMs: number,
  baseAppState: AppState
): MatchState {
  if (state.intent.kind !== 'drive') return state;
  const carrierPos = state.off[state.carrier];
  if (!carrierPos) return state;
  const dx = state.intent.target.x - carrierPos.x;
  const dy = state.intent.target.y - carrierPos.y;
  const dist = Math.hypot(dx, dy);
  // Arrivé à destination : résoudre le tir au prochain tick.
  if (dist < 4) {
    state.off[state.carrier] = { ...state.intent.target };
    state.ballPos = ballAt(state.intent.target);
    const action = state.intent.expectedAction;
    state.intent = { kind: 'shoot', action, forced: false };
    refreshDefense(state, baseAppState);
    return state;
  }
  // Sinon, faire un pas borné vers la cible.
  const step = Math.min(dist, MAX_CARRIER_STEP_PX);
  const nx = carrierPos.x + (dx / dist) * step;
  const ny = carrierPos.y + (dy / dist) * step;
  state.off[state.carrier] = { x: nx, y: ny };
  state.ballPos = ballAt({ x: nx, y: ny });
  // Si on a juste un peu bougé, on recompute la défense pour qu'elle
  // suive (V1 simple : à chaque tick. Optim possible plus tard).
  refreshDefense(state, baseAppState);
  return state;
}

function advancePass(
  state: MatchState,
  _dtMs: number,
  baseAppState: AppState
): MatchState {
  if (state.intent.kind !== 'pass') return state;
  const from = state.off[state.carrier];
  const to = state.off[state.intent.receiver];
  if (!from || !to) return state;
  // Vitesse de passe : on simule en 18 ticks (~600 ms à 30 Hz, comme avant
  // à 5 Hz × 3 ticks).
  const PASS_DURATION_TICKS = 18;
  const newProgress = state.intent.progress + 1 / PASS_DURATION_TICKS;
  if (newProgress >= 1) {
    // Passe arrivée : nouveau porteur.
    const action = state.intent.expectedAction;
    // RNG seedée pour déterminisme (avant : Math.random() = non-reproductible).
    const passRng = seededAiRng(state.seed + state.tickCount * 31 + 1);
    const passLost = newProgress > 1.5 ? false : passRng() > action.successRate;
    if (passLost) {
      state.outcome = 'turnover-pass';
      state.eventLog.push({
        possession: state.possession,
        clock: state.shotClockMs / 1000,
        actor: state.carrier,
        targetId: state.intent.receiver,
        type: 'turnover',
        label: `Passe perdue ${state.carrier}→${state.intent.receiver}`,
      });
      state.intent = { kind: 'idle' };
      return state;
    }
    const previousCarrier = state.carrier;
    const newCarrier = state.intent.receiver;
    state.carrier = newCarrier;
    state.ballPos = ballAt(to);
    state.eventLog.push({
      possession: state.possession,
      clock: state.shotClockMs / 1000,
      actor: previousCarrier,
      targetId: newCarrier,
      type: 'pass',
      label: `Passe ${previousCarrier}→${newCarrier}`,
    });
    state.intent = { kind: 'idle' };
    // B2 — l'ancien porteur relocate vers son slot vacant.
    const relocate = triggerRelocateAfterPass({
      previousCarrier,
      newCarrier,
      off: state.off,
      hoop: getDefenseHoop(baseAppState),
      attackerProfiles: baseAppState.attackerProfiles,
    });
    if (relocate) {
      state.offBallIntents = { ...state.offBallIntents, [previousCarrier]: relocate };
    }
    // Le nouveau porteur ne doit plus avoir d'intent off-ball.
    if (state.offBallIntents[newCarrier]) {
      const cleaned = { ...state.offBallIntents };
      delete cleaned[newCarrier];
      state.offBallIntents = cleaned;
    }
    refreshDefense(state, baseAppState);
    return state;
  }
  // Passe en cours : la balle vole.
  state.intent = { ...state.intent, progress: newProgress };
  state.ballPos = {
    x: from.x + (to.x - from.x) * newProgress,
    y: from.y + (to.y - from.y) * newProgress - parabolaArc(newProgress, dist(from, to)),
  };
  return state;
}

function resolveShot(
  state: MatchState,
  action: OffensiveAction,
  rng: () => number,
  forced: boolean,
  baseAppState: AppState
): MatchState {
  const made = rng() < action.scoreProbability;
  const points = made ? action.shotPoints : 0;
  state.score = points;
  state.outcome = made
    ? forced
      ? 'forced-shot-made'
      : 'shot-made'
    : forced
      ? 'forced-shot-missed'
      : 'shot-missed';

  // B3a — métadonnées de tir enrichies : zone, contestation, position.
  // On reprend les mêmes helpers que `evaluateOffensiveOptions` pour
  // garantir la cohérence avec le `scoreProbability` déjà calculé.
  const hoop = getDefenseHoop(baseAppState);
  const distFromHoop = distance(action.shotPos, hoop);
  const shotZone = shotZoneFor(distFromHoop);
  const contestDistance = nearestDefenderDistance(action.shotPos, state.defPos);
  const contested = contestDistance <= CONTEST_THRESHOLD_PX;

  const verb = forced ? 'Tir forcé' : 'Tir';
  const contestSuffix = contested ? ' contesté' : '';
  const zoneSuffix = SHOT_ZONE_LABELS[shotZone];
  const pctText = `${Math.round(action.scoreProbability * 100)} %`;
  const label = `${verb} ${state.carrier} ${zoneSuffix}${contestSuffix} (${pctText})`;

  state.eventLog.push({
    possession: state.possession,
    clock: state.shotClockMs / 1000,
    actor: state.carrier,
    type: forced ? 'forced-shot' : 'shot',
    label,
    expectedPoints: action.expectedPoints,
    scoreProbability: action.scoreProbability,
    points,
    shotZone,
    contestDistance,
    contested,
    shotPos: { ...action.shotPos },
    shotPointsAttempted: action.shotPoints,
  });
  state.intent = { kind: 'idle' };
  // Phase E.1 V1 — box-out visuel : chaque défenseur shift vers son
  // matched attaquant + offset BOXOUT_OFFSET_PX en direction du panier.
  // Visible pendant la pause de transition (1.5 s) avant la résolution
  // du rebond.
  applyBoxOutPositions(state, hoop);
  return state;
}

function applyBoxOutPositions(state: MatchState, hoop: Point): void {
  (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
    const def = state.defPos[id];
    if (!def) return;
    const matchedAtt = state.off[def.matchedTo as AttackerId];
    if (!matchedAtt) return;
    // Direction de l'attaquant vers le panier — c'est cette direction
    // qu'il faut bloquer (le défenseur se met "entre l'attaquant et
    // le panier"). On positionne le défenseur à BOXOUT_OFFSET_PX
    // de l'attaquant côté panier.
    const dx = hoop.x - matchedAtt.x;
    const dy = hoop.y - matchedAtt.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    state.defPos[id] = {
      ...def,
      x: matchedAtt.x + (dx / d) * BOXOUT_OFFSET_PX,
      y: matchedAtt.y + (dy / d) * BOXOUT_OFFSET_PX,
    };
  });
}

function refreshDefense(state: MatchState, baseAppState: AppState): void {
  // Pour rester simple en V1, on recompute en injectant les positions
  // courantes dans un step synthétique. Coûteux à 5 Hz × scénarios
  // complexes — à optimiser via cache segmentaire en V2.
  const syntheticStep: Step = {
    ...baseAppState.steps[baseAppState.activeStep],
    off: state.off,
    ballCarrier: state.carrier,
    annotations: [],
  };
  const syntheticState: AppState = {
    ...baseAppState,
    steps: [...baseAppState.steps.slice(0, baseAppState.activeStep), syntheticStep],
    activeStep: baseAppState.activeStep,
  };
  state.defPos = effectiveDefensePositions(syntheticState, baseAppState.activeStep);
}

function ballAt(carrierPos: Point): Point {
  return { x: carrierPos.x + 16, y: carrierPos.y - 16 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function parabolaArc(progress: number, totalDist: number): number {
  // Arc parabolique pour la passe : pic à progress=0.5.
  const height = Math.min(80, totalDist * 0.18);
  return 4 * height * progress * (1 - progress);
}

function cloneOff(off: AttackerPositions): AttackerPositions {
  const out = {} as AttackerPositions;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const p = off[id];
    if (p) out[id] = { x: p.x, y: p.y };
  });
  return out;
}

function cloneDef(def: ComputedDefense): ComputedDefense {
  const out = {} as ComputedDefense;
  (Object.keys(def) as DefenderId[]).forEach((id) => {
    out[id] = { ...def[id] };
  });
  return out;
}
