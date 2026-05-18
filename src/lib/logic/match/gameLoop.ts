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
import { buildInboundSetup } from '../inboundSetup';
import { HALF_COURT_Y } from '../awayPossessionSetup';
import { advanceBallAdvance } from './ballAdvance';

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

/** Durée maximale de remise en jeu (FIBA / NBA : 5 secondes pour
 *  faire la passe rentrante). Au-delà = violation, possession perdue.
 *  Décompté côté live quand `step.context` débute par 'inbound-'. */
const INBOUND_TIMER_MS = 5_000;

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

/** Box-Out V2 — durée d'animation. Sur 500 ms (~15 ticks à 30 Hz),
 *  les défenseurs lerp depuis leur position pré-tir vers leur position
 *  de box-out. Après, ils restent figés sur la cible jusqu'à la fin
 *  de la pause de transition (≈ 1500 - 500 = 1000 ms supplémentaires). */
const BOXOUT_ANIMATION_MS = 500;

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
  | { kind: 'away-possession'; remainingMs: number }
  // Phase 1.2 — Montée de balle après remise en jeu en backcourt.
  // Le porteur drive vers la ligne médiane à vitesse réduite.
  // advanceTimerMs : timer FIBA 8s pour franchir la médiane (sinon violation).
  | { kind: 'advance'; targetY: number; advanceTimerMs: number };

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
  /** Timer de violation 5s de remise en jeu. `null` quand on n'est PAS
   *  en remise active (= passe déjà effectuée, ou step non inbound).
   *  Quand non-null, décompté à chaque tick et déclenche `turnover-pass`
   *  si la balle n'est pas passée à temps. */
  inboundTimerMs: number | null;
  /** Box-Out V2 — animation : cibles de box-out posées au moment de
   *  `resolveShot`. Pendant la pause de transition, chaque défenseur
   *  lerp depuis sa position pré-tir vers `boxOutTargets[id]` sur les
   *  premiers `BOXOUT_ANIMATION_MS` du timer. `null` hors phase rebond. */
  boxOutTargets: Partial<Record<DefenderId, Point>> | null;
  /** Box-Out V2 — instant (en ms `possessionTimeMs`) où le box-out a
   *  débuté. Utilisé pour calculer la progression d'animation. */
  boxOutStartedAtMs: number | null;
  /** E.3 — résultat de rebond pré-calculé au moment du tir.
   *  Permet d'animer le ballon vers la position du rebondeur PENDANT
   *  la pause de transition (au lieu de calculer à la fin et téléporter
   *  la balle). `null` hors phase rebond. */
  pendingRebound: ReboundResult | null;
  /** E.3 — position du ballon au moment du tir (= position du shooter).
   *  Point de départ de l'animation de trajectoire (shooter → cercle
   *  → rebondeur). */
  shotBallStartPos: Point | null;
  /** E.1 V2 stage 1 — position du ballon adverse pendant la phase
   *  `away-possession`. Animé entre 3-4 points imaginaires dans le
   *  back-court pour donner du mouvement visible. `null` hors away. */
  awayBallPos: Point | null;
  /** E.1 V2 stage 2a — positions des 5 joueurs adverses simulés
   *  pendant la phase `away-possession`. Calculées comme miroir des
   *  défenseurs home, puis animées vers leur panier (haut du terrain
   *  en full court, hors viewport en half court). `null` hors away. */
  awayPlayerPositions: Record<DefenderId, Point> | null;
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
  /** Phase 1.4 — Stats équipe agrégées sur la session. Invariant :
   *  teamStats.home.points === homeScore (idem away). */
  teamStats: {
    home: TeamStats;
    away: TeamStats;
  };
}

/** Phase 1.4 — Stats agrégées pour une équipe (cumul sur la session). */
export interface TeamStats {
  points: number;
  fgMade: number;
  fgAttempted: number;
  turnovers: number;
  /** Rebonds offensifs. */
  oReb: number;
  /** Rebonds défensifs. */
  dReb: number;
}

function emptyTeamStats(): TeamStats {
  return {
    points: 0,
    fgMade: 0,
    fgAttempted: 0,
    turnovers: 0,
    oReb: 0,
    dReb: 0,
  };
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
  /** Phase 1.1 — Force le résultat (panier marqué ou non) du stub
   *  away-possession à sa fin. Permet de tester déterministiquement
   *  les transitions away→home avec/sans inbound. */
  awayScoreOverride?: boolean;
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
    // Remise en jeu : la passe rentrante a démarré, on désarme le
    // timer 5s (plus de violation possible).
    next.inboundTimerMs = null;
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
  }

  // E.3 — animer le ballon : tireur → cercle → rebondeur (parabole).
  // Sur tir réussi (pas de pendingRebound), le ballon descend au cercle
  // puis reste. Sur tir manqué, il rebondit vers la position du rebondeur.
  if (next.shotBallStartPos && next.transitionStartedAtMs !== null) {
    const hoop = getDefenseHoop(baseAppState);
    const elapsed = next.possessionTimeMs - next.transitionStartedAtMs;
    const totalDuration = TRANSITION_PAUSE_MS;
    const progress = Math.min(1, elapsed / totalDuration);
    if (next.pendingRebound && next.pendingRebound.rebounder) {
      // Tir manqué : trajectoire shooter → cercle → rebondeur (2 phases).
      // Phase 1 (0-50%) : ballon va au cercle avec arc haut.
      // Phase 2 (50-100%) : ballon descend vers le rebondeur.
      const reboundPos = next.pendingRebound.position;
      if (progress < 0.5) {
        const t = progress / 0.5;
        const baseY =
          next.shotBallStartPos.y + (hoop.y - next.shotBallStartPos.y) * t;
        const baseX =
          next.shotBallStartPos.x + (hoop.x - next.shotBallStartPos.x) * t;
        // Arc parabolique : peak à t=0.5, hauteur 50 px au-dessus de la droite.
        const arc = 50 * 4 * t * (1 - t);
        next.ballPos = { x: baseX, y: baseY - arc };
      } else {
        const t = (progress - 0.5) / 0.5;
        const baseX = hoop.x + (reboundPos.x - hoop.x) * t;
        const baseY = hoop.y + (reboundPos.y - hoop.y) * t;
        // Petit ricoche bas (arc 25 px).
        const arc = 25 * 4 * t * (1 - t);
        next.ballPos = { x: baseX, y: baseY - arc };
      }
    } else {
      // Tir réussi : ballon va au cercle puis reste, avec arc complet.
      const t = progress;
      const baseX =
        next.shotBallStartPos.x + (hoop.x - next.shotBallStartPos.x) * t;
      const baseY =
        next.shotBallStartPos.y + (hoop.y - next.shotBallStartPos.y) * t;
      const arc = 60 * 4 * t * (1 - t);
      next.ballPos = { x: baseX, y: baseY - arc };
    }
  }

  // Box-Out V2 — animer les défenseurs vers leurs cibles sur les
  // premières BOXOUT_ANIMATION_MS de la pause, puis figer.
  if (next.boxOutTargets && next.boxOutStartedAtMs !== null) {
    const boxOutElapsed = next.possessionTimeMs - next.boxOutStartedAtMs;
    const progress = Math.min(1, boxOutElapsed / BOXOUT_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    (Object.keys(next.boxOutTargets) as DefenderId[]).forEach((id) => {
      const target = next.boxOutTargets?.[id];
      const cur = next.defPos[id];
      if (!target || !cur) return;
      next.defPos[id] = {
        ...cur,
        x: cur.x + (target.x - cur.x) * eased * 0.3,
        y: cur.y + (target.y - cur.y) * eased * 0.3,
      };
    });
    // Quand animation finie, on bloque les cibles à leur valeur finale.
    if (progress >= 1) {
      (Object.keys(next.boxOutTargets) as DefenderId[]).forEach((id) => {
        const target = next.boxOutTargets?.[id];
        const cur = next.defPos[id];
        if (!target || !cur) return;
        next.defPos[id] = { ...cur, x: target.x, y: target.y };
      });
    }
  }

  const elapsed = next.possessionTimeMs - next.transitionStartedAtMs;
  if (elapsed < TRANSITION_PAUSE_MS) {
    return next; // toujours en pause
  }

  // Pause terminée : on désarme le box-out (la transition va peut-être
  // reset les positions ou démarrer une nouvelle possession).
  next.boxOutTargets = null;
  next.boxOutStartedAtMs = null;
  // E.3 — désarme l'animation ballon (la transition gère la suite).
  next.pendingRebound = null;
  next.shotBallStartPos = null;

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
  // E.3 — Si `pendingRebound` a déjà été calculé au moment du tir, on
  // le réutilise (pour assurer la cohérence avec l'animation du ballon).
  const reboundRateOverride = options.offensiveReboundRate;
  let rebound: ReboundResult | null = null;
  let offensiveReboundDecided = false;
  if (isMissedShot) {
    if (reboundRateOverride !== undefined) {
      offensiveReboundDecided = rng() < reboundRateOverride;
    } else if (state.pendingRebound) {
      // E.3 — réutiliser le pré-calcul, pas de re-roll.
      rebound = state.pendingRebound;
      offensiveReboundDecided = rebound.type === 'offensive';
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

  // Phase 1.4 — Stats équipe : sur tir manqué, le rebond va à l'équipe
  // qui le capture. Offensive rebound = même équipe que shooter; défensif
  // = équipe adverse.
  let teamStats = state.teamStats;
  if (isMissedShot) {
    const shooterTeam = state.attackingTeam;
    const reboundingTeam = offensiveReboundDecided
      ? shooterTeam
      : shooterTeam === 'home'
        ? 'away'
        : 'home';
    const statKey = offensiveReboundDecided ? 'oReb' : 'dReb';
    teamStats = {
      ...teamStats,
      [reboundingTeam]: {
        ...teamStats[reboundingTeam],
        [statKey]: teamStats[reboundingTeam][statKey] + 1,
      },
    };
  }

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
      teamStats,
    };
  }

  const stateForTransition: MatchState = {
    ...state,
    possessionsPlayed: nextPossessionsPlayed,
    teamStats,
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
  // Phase 1.1 — Si home vient de marquer un panier, on enclenche un
  // timer de remise en jeu 5s (FIBA). Pendant ce timer, l'away est
  // visuellement en position de remise au top du terrain :
  // - 5 away players en BLOB box-set derrière la baseline home
  //   (y entre 8 et 170, BLOB classique)
  // - awayBallPos sur l'inbounder (y ≈ 8)
  // Sur défensif rebound ou turnover, pas d'inbound baseline.
  const isMadeShot =
    state.outcome === 'shot-made' || state.outcome === 'forced-shot-made';
  const inboundTimerMs = isMadeShot ? INBOUND_TIMER_MS : null;

  let awayPlayerPositions: Record<DefenderId, Point> | null = null;
  let awayBallPos: Point | null = null;
  if (isMadeShot) {
    const setup = buildInboundSetup('inbound-baseline');
    // Re-key off (O1..O5) → defender ids (D1..D5) puisque
    // awayPlayerPositions est indexé par DefenderId. Mapping nominal
    // (O1→D1, etc.) — pas de matchup réel en Phase 1.
    awayPlayerPositions = {
      D1: setup.off.O1,
      D2: setup.off.O2,
      D3: setup.off.O3,
      D4: setup.off.O4,
      D5: setup.off.O5,
    };
    awayBallPos = { ...setup.off[setup.inbounder] };
  }

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
    inboundTimerMs,
    awayPlayerPositions,
    awayBallPos,
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
  rng: () => number,
  awayScoreOverride?: boolean
): MatchState {
  if (state.intent.kind !== 'away-possession') return state;
  const remaining = state.intent.remainingMs - dtMs;
  if (remaining > 0) {
    // Phase 1.1 — Pendant la phase d'inbound visible (inboundTimerMs !== null),
    // on fige les positions BLOB posées par startAwayPossession. Le shot
    // clock continue de tourner mais les sprites restent en place.
    // Le timer d'inbound est décrémenté par tickMatch en amont, donc ici
    // on lit l'état post-décrément.
    //
    // Au bout de ~3s (= timer < 2000), on désarme l'inbound : la passe
    // rentrante virtuelle est "faite", le stub animation prend le relais.
    if (state.inboundTimerMs !== null && state.inboundTimerMs > 0) {
      if (state.inboundTimerMs <= 2_000) {
        // Désarme le timer → tick suivant utilise le stub animation
        return {
          ...state,
          intent: { kind: 'away-possession', remainingMs: remaining },
          shotClockMs: Math.max(0, remaining),
          inboundTimerMs: null,
        };
      }
      return {
        ...state,
        intent: { kind: 'away-possession', remainingMs: remaining },
        shotClockMs: Math.max(0, remaining),
      };
    }
    // E.1 V2 stage 1 + 2a — anime le ballon adverse ET les 5 positions
    // des joueurs adverses pendant la possession stubbée.
    const totalDuration = AWAY_POSSESSION_DURATION_MS;
    const elapsed = totalDuration - remaining;
    const progress = Math.max(0, Math.min(1, elapsed / totalDuration));
    const awayBallPos = computeAwayBallPosition(progress, baseAppState);
    const awayPlayerPositions = computeAwayPlayerPositions(
      progress,
      state.defPos,
      baseAppState
    );
    return {
      ...state,
      intent: { kind: 'away-possession', remainingMs: remaining },
      shotClockMs: Math.max(0, remaining),
      awayBallPos,
      awayPlayerPositions,
    };
  }
  // Possession adverse terminée : outcome.
  const made = awayScoreOverride ?? (rng() < AWAY_SCORE_PROBABILITY);
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
  // Phase 1.1 — Si l'away vient de marquer, home récupère le ballon
  // pour une remise en jeu : BLOB box-set mirroré derrière la baseline
  // away (y > 1060 en full court). Sinon (tir adverse manqué = rebond
  // live), reprise depuis l'étape de base.
  const inboundSetup = made ? buildInboundSetup('inbound-baseline') : null;
  const baseOff = activeOffense(step.off, baseAppState.playerCount);
  const off: AttackerPositions = inboundSetup
    ? (Object.fromEntries(
        Object.entries(inboundSetup.off).map(([id, p]) => [
          id,
          { x: p.x, y: 2 * HALF_COURT_Y - p.y },
        ])
      ) as AttackerPositions)
    : baseOff;
  const carrier: AttackerId = inboundSetup
    ? inboundSetup.inbounder
    : activeBallCarrier(step, baseAppState.playerCount);
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
    awayBallPos: null, // désarme l'animation
    awayPlayerPositions: null,
    // Phase 1.1 — Si away vient de marquer, home a 5s pour rentrer la balle.
    // Sinon (tir manqué adverse = rebond live), pas d'inbound.
    inboundTimerMs: made ? INBOUND_TIMER_MS : null,
    // Phase 1.4 — Stats équipe : le stub away a tenté 1 tir, réussi ou non.
    teamStats: {
      ...state.teamStats,
      away: {
        ...state.teamStats.away,
        points: state.teamStats.away.points + pts,
        fgMade: state.teamStats.away.fgMade + (made ? 1 : 0),
        fgAttempted: state.teamStats.away.fgAttempted + 1,
      },
    },
  };
}

/**
 * E.1 V2 stage 2a — Calcule les positions des 5 joueurs adverses
 * simulés pendant leur possession. Initialement = miroir vertical des
 * défenseurs home autour de y=540 (centre du full court). À mesure
 * que la possession progresse, les adversaires "remontent" vers leur
 * panier (= côté bas du terrain home).
 *
 * Convention V1 : on indexe les positions par DefenderId pour simplifier
 * le tracking (D1 adverse = miroir de D1 home, etc.). Pas de notion de
 * matchups inversés en mémoire (= V2 stage 2b).
 */
function computeAwayPlayerPositions(
  progress: number,
  homeDefPos: ComputedDefense,
  baseAppState: AppState
): Record<DefenderId, Point> {
  const isFullCourt = baseAppState.fullCourt === true;
  const out = {} as Record<DefenderId, Point>;
  // Positions initiales : miroir vertical autour de la ligne médiane.
  // En full court, ligne médiane = y=540. En half court, on simule
  // un miroir autour de y=540 mais ça déborde du viewport visible —
  // les positions seront partiellement hors-écran (acceptable, le
  // ballon principal awayBallPos reste visible).
  const mirrorAxisY = 540;

  // Une vague de "remontée" pendant la possession : à progress=0 les
  // adversaires sont dans leur back-court, à progress=1 ils sont
  // proches du panier home (= ils ont attaqué).
  // En full court, panier home = (300, 75) — donc ils remontent vers
  // y faible. En half court, idem mais les positions de départ sont
  // y >> 540 (déborde) puis convergent vers y=540-300 visible.
  const targetHoopY = isFullCourt ? 90 : 200; // approximation visible
  // L'amplitude de la course dépend du progress et du joueur (les
  // intérieurs courent plus vite, les ailiers moins).
  const courseFactors: Record<DefenderId, number> = {
    D1: 0.5,  // PG adverse, modère
    D2: 0.6,  // SG, course
    D3: 0.65, // SF, course
    D4: 0.85, // PF, course intérieur
    D5: 0.95, // C, le plus rapide vers le panier
  };

  (Object.keys(homeDefPos) as DefenderId[]).forEach((id) => {
    const homePos = homeDefPos[id];
    if (!homePos) {
      out[id] = { x: 300, y: mirrorAxisY };
      return;
    }
    // Position miroir initiale.
    const mirrorX = homePos.x;
    const mirrorY = 2 * mirrorAxisY - homePos.y;
    // Course vers le panier home selon le facteur du joueur.
    const factor = courseFactors[id] ?? 0.5;
    const reachY = mirrorY + (targetHoopY - mirrorY) * progress * factor;
    out[id] = { x: mirrorX, y: reachY };
  });

  return out;
}

/**
 * E.1 V2 stage 1 — Calcule la position du ballon adverse pendant sa
 * possession stubbée. Anime entre 4 waypoints dans le back-court
 * (full court : moitié haute; half court : on simule un déplacement
 * latéral). 4 phases = passe-passe-drive-tir.
 */
function computeAwayBallPosition(progress: number, baseAppState: AppState): Point {
  // 4 waypoints qui simulent une possession adverse :
  // - W0 : outlet ball-side (= setup)
  // - W1 : relai milieu de terrain
  // - W2 : drive ball-side
  // - W3 : tir sous-cercle adverse (= bord opposé du terrain)
  //
  // Half-court (innerMaxY = 540) : on anime dans la zone 350-540
  // pour donner l'illusion d'un back-court.
  // Full-court : on anime dans la moitié haute (y > 600 si HOOP en
  // bas, mais par défaut on inverse symétriquement).
  const isFullCourt = baseAppState.fullCourt === true;
  const isAttackingUp = baseAppState.attackingDirection !== 'down';
  // Pour simplifier : on suppose hoop home en haut (y=75). L'adverse
  // attaque vers le bas (y vers 1005 si full court, sinon on simule
  // dans le bas du half court y=450-540).
  const baseY = isFullCourt ? 800 : 480; // zone de jeu adverse simulée
  const yRange = isFullCourt ? 180 : 60;

  // Waypoints :
  const waypoints: Point[] = [
    { x: 480, y: baseY + yRange }, // W0 outlet droite
    { x: 360, y: baseY + yRange * 0.5 }, // W1 relai milieu
    { x: 240, y: baseY }, // W2 drive
    { x: 300, y: isFullCourt ? 1005 : baseY - yRange * 0.6 }, // W3 tir
  ];

  // Segment courant : progress [0,1] divisé en 3 segments
  // (W0→W1, W1→W2, W2→W3).
  const numSegments = waypoints.length - 1;
  const segIdx = Math.min(numSegments - 1, Math.floor(progress * numSegments));
  const segT = progress * numSegments - segIdx;
  const from = waypoints[segIdx];
  const to = waypoints[segIdx + 1];
  // Arc parabolique léger sur le segment de tir (segIdx === 2)
  let arc = 0;
  if (segIdx === 2) {
    arc = 30 * 4 * segT * (1 - segT);
  }
  return {
    x: from.x + (to.x - from.x) * segT,
    y: from.y + (to.y - from.y) * segT - arc,
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
      // Phase 1.4 — Compte le turnover sur l'équipe qui passait.
      state.teamStats = {
        ...state.teamStats,
        [state.attackingTeam]: {
          ...state.teamStats[state.attackingTeam],
          turnovers: state.teamStats[state.attackingTeam].turnovers + 1,
        },
      };
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

  // Phase 1.4 — Stats équipe : agrège ce tir sur l'équipe qui attaque.
  const team = state.attackingTeam;
  state.teamStats = {
    ...state.teamStats,
    [team]: {
      ...state.teamStats[team],
      points: state.teamStats[team].points + points,
      fgMade: state.teamStats[team].fgMade + (made ? 1 : 0),
      fgAttempted: state.teamStats[team].fgAttempted + 1,
    },
  };

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
  // Box-Out V2 — au lieu de snapper instantanément les défenseurs sur
  // leurs positions de box-out, on POSE les cibles et on laisse
  // handleTransitionPause animer le déplacement sur BOXOUT_ANIMATION_MS.
  state.boxOutTargets = computeBoxOutTargets(state, hoop);
  state.boxOutStartedAtMs = state.possessionTimeMs;
  // E.3 — pré-calcul du rebond pour animer le ballon pendant la pause.
  // Sur tir manqué uniquement : on appelle computeRebound MAINTENANT
  // pour connaître la position d'arrivée du ballon. Sur tir réussi, le
  // ballon reste au cercle (pas de rebond).
  const carrierPos = state.off[state.carrier];
  state.shotBallStartPos = carrierPos ? { ...carrierPos } : { ...action.shotPos };
  if (!made) {
    const reboundRng = seededAiRng(state.seed + state.tickCount * 17 + 3);
    state.pendingRebound = computeRebound({
      off: state.off,
      defPos: state.defPos,
      hoop,
      shotPos: action.shotPos,
      attackerProfiles: baseAppState.attackerProfiles,
      shooter: state.carrier,
      rng: reboundRng,
    });
  } else {
    state.pendingRebound = null;
  }
  return state;
}

function computeBoxOutTargets(
  state: MatchState,
  hoop: Point
): Partial<Record<DefenderId, Point>> {
  const targets: Partial<Record<DefenderId, Point>> = {};
  (Object.keys(state.defPos) as DefenderId[]).forEach((id) => {
    const def = state.defPos[id];
    if (!def) return;
    const matchedAtt = state.off[def.matchedTo as AttackerId];
    if (!matchedAtt) return;
    const dx = hoop.x - matchedAtt.x;
    const dy = hoop.y - matchedAtt.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      targets[id] = { x: def.x, y: def.y };
      return;
    }
    targets[id] = {
      x: matchedAtt.x + (dx / d) * BOXOUT_OFFSET_PX,
      y: matchedAtt.y + (dy / d) * BOXOUT_OFFSET_PX,
    };
  });
  return targets;
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
