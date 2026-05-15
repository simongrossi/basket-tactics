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

// ============================================================
// Constantes
// ============================================================

/** Cadence décisionnelle nominale. 5 Hz = 200 ms par tick.
 *  Standard NBA pour modéliser une décision humaine "consciente"
 *  (ms reaction time ~ 250 ms). */
export const MATCH_TICK_MS = 200;

/** Shot clock initial en millisecondes. Surchargeable via options. */
const DEFAULT_SHOT_CLOCK_MS = 24_000;

/** Seuil "low clock" où on force le tir si on a une option. */
const LOW_CLOCK_MS = 4_500;

/** Si une action de drive dépasse cette distance px en un tick,
 *  on la lisse sur N sous-pas pour éviter les téléports. V1 simple :
 *  on cap à 50 px/tick (= ~250 px/s ≈ 6,75 m/s, sprint réaliste). */
const MAX_CARRIER_STEP_PX = 50;

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
 *  l'action n'est pas terminée. */
export type CarrierIntent =
  | { kind: 'idle' }
  | { kind: 'drive'; target: Point; expectedAction: OffensiveAction }
  | { kind: 'pass'; receiver: AttackerId; progress: number; expectedAction: OffensiveAction }
  | { kind: 'shoot'; action: OffensiveAction; forced: boolean };

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
  /** Score final (0/2/3) si la possession est terminée, sinon 0. */
  score: number;
  /** Outcome final si terminé, sinon `null` (= en cours). */
  outcome: AiPossessionOutcome | null;
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
}

export interface TickMatchOptions {
  /** Créativité (0..1) qui module la "température" softmax de la
   *  sélection d'action. Default : 0.35 (légère variance vs meilleure EV). */
  creativity?: number;
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
    score: 0,
    outcome: null,
    eventLog: [],
    seed,
    possession,
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
  if (matchState.outcome !== null) return matchState;
  const creativity = options.creativity ?? DEFAULT_CREATIVITY;
  const rng = seededAiRng(matchState.seed + matchState.tickCount);
  const next: MatchState = {
    ...matchState,
    off: cloneOff(matchState.off),
    defPos: cloneDef(matchState.defPos),
    ballPos: { ...matchState.ballPos },
    eventLog: [...matchState.eventLog],
    tickCount: matchState.tickCount + 1,
    possessionTimeMs: matchState.possessionTimeMs + dtMs,
    shotClockMs: Math.max(0, matchState.shotClockMs - dtMs),
  };

  // Shot clock expiré : forced shot sur l'action shoot disponible (ou tir
  // forcé à 0 % si rien d'utile).
  if (next.shotClockMs === 0 && next.intent.kind !== 'shoot') {
    const action = pickForcedShot(next, baseAppState);
    return resolveShot(next, action, rng, true, baseAppState);
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
  // Vitesse de passe : on simule en 3 ticks (~600 ms).
  const PASS_DURATION_TICKS = 3;
  const newProgress = state.intent.progress + 1 / PASS_DURATION_TICKS;
  if (newProgress >= 1) {
    // Passe arrivée : nouveau porteur.
    const action = state.intent.expectedAction;
    const passLost = newProgress > 1.5 ? false : Math.random() > action.successRate;
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
    const newCarrier = state.intent.receiver;
    state.carrier = newCarrier;
    state.ballPos = ballAt(to);
    state.eventLog.push({
      possession: state.possession,
      clock: state.shotClockMs / 1000,
      actor: state.carrier,
      targetId: newCarrier,
      type: 'pass',
      label: `Passe ${state.carrier}→${newCarrier}`,
    });
    state.intent = { kind: 'idle' };
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
  return state;
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
