// Calcul d'une frame interpolée pendant le playback (lecture continue OU
// scrub timeline). Code partagé pour les deux usages — sinon les deux
// chemins divergent et on retrouve les bugs de scrub vs play.
//
// Cette fonction est PURE : prend un état + un instant fractionnaire `t`,
// retourne la frame complète. Le hook `usePlaybackAnimation` se contente
// de l'appeler à chaque tick.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedAttackerVisuals,
  ComputedDefense,
  DefenderId,
  DetectedOffBallScreen,
  DetectedScreen,
  Matchups,
  Point,
  Step,
} from '@/lib/types';
import {
  computeAttackerVisuals,
  effectiveDefensePositions,
  followDefendersAtFrame,
  getDefenseHoop,
  getMatchupsAt,
  recomputeDefenseFrameOrientations,
} from '../engine';
import {
  computeBallFrame,
  curveAroundObstacle,
  curveAroundStaggeredPair,
  pickBlockingCluster,
  pickStaggeredPair,
  pushOutOfMany,
  resolvePlayerCollisions,
} from '../geometry';
import { pushOutOfScreenContact } from '../screenCollision';
import { solveEntityCollisions } from '../constraintSolver';
import { computeDefensiveRoute, sampleRoute, type RouteObstacle } from '../defensiveRoute';
import { applyEasing } from './easing';
import { applyPathAwareInterpolation } from './pathAwareInterpolation';
import { getStepDurationSeconds } from '../timecode';
import { resolveAnnotationTiming } from '../annotationTiming';
import { activeBallCarrier, activeOffense } from '../players';
import { attackerTrajectoryAt, type MovementType } from '../playbackTrajectory';
import { lerpAngleDeg } from '../angles';
import { buildStep0DetectionPositions } from '../step0Detection';
import { closeoutEasing } from '../closeoutEasing';
import {
  PLAYER_MIN_CLEARANCE_PX,
  PLAYER_OBSTACLE_RADIUS_PX,
} from '@/lib/data/court';
import {
  carrierApexSlownessFromQuality,
  carrierScreenRouteKind,
  carrierScreenRoutePreference,
  effectiveScreenRuleForDef,
  forcedPushSignForRoute,
  offBallScreenRouteKind,
  offBallScreenRoutePreference,
  resolveScreenContactState,
  screenContactAdhesion,
  screenContactExitRadius,
  screenContactQualityPassesHysteresis,
  screenContactT,
  screenContactTangentRelease,
  type ScreenContactState,
  type ScreenRouteKind,
} from '../screenPhysics';
import {
  buildSegmentScreenObstacles,
  defenderScreenContact,
  detectScreenContext,
  emptyScreenContext,
  hasCarrierScreenAnnotation,
  offBallScreeners,
  screenContactScreenerPoint,
  type ScreenContext,
  type ScreenObstacle,
} from '../screenContext';

/** Trace des décisions prises pour un défenseur au sein de `resolveFrameAt`.
 *  Capturée UNIQUEMENT quand `options.collectDecisions` est true (= tests
 *  diagnostic). Permet, quand un saut anormal est détecté inter-frame, de
 *  voir DIRECTEMENT ce qui a changé : screenMode passé de `arriving` à
 *  `stuck`, cluster qui flippe entre `staggered-pair` et `single`, etc.
 *  Cf. `playbookJumpsWithDiagnostic.test.ts`. */
export interface FrameDecision {
  /** Mode de contact d'écran calculé par `defenderScreenContact`. */
  screenMode: 'arriving' | 'stuck' | 'leaving' | null;
  /** État complet de la machine d'écran. */
  screenState: ScreenContactState | undefined;
  /** Qualité (0..100+) du contact, intègre rule + type. */
  quality: number;
  /** Identité logique du contact, stable entre endpoints quand possible. */
  contactKey: string | undefined;
  /** Type de contact utilisé par le resolver. */
  contactKind: 'carrier' | 'off-ball' | undefined;
  /** Poseur choisi comme point d'ancrage du contact. */
  contactScreener: AttackerId | undefined;
  contactScreenerDef: DefenderId | undefined;
  /** Poseurs impliqués dans le contact, notamment sur double écran off-ball. */
  contactScreeners: AttackerId[] | undefined;
  /** Poseur physique actif dans une séquence multi-contact. */
  activeScreener: AttackerId | undefined;
  /** Le défenseur a un contact porteur (carrierContact). */
  carrierContact: boolean;
  /** Le défenseur a un contact off-ball (type d'écran ou undefined). */
  offBallContactType: string | undefined;
  /** Choix de la branche de courbe : staggered-pair, single-blocking, none. */
  curveBranch: 'staggered-pair' | 'single-blocking' | 'none';
  /** ID du cluster utilisé pour la Bezier : defenderToSkip du screen obstacle
   *  matché, ou fallback "(x,y)" arrondi si le matching échoue. */
  clusterId: string | undefined;
  /** Mode de pushOut appliqué : naive (pushOutOfMany), constrained
   *  (pushOutOfScreenContact) ou skipped. */
  pushMode: 'naive' | 'constrained' | 'skipped';
  /** forcedPushSign passé à curveAroundObstacle, si défini. */
  forcedPushSign: number | undefined;
  /** Route tactique explicite utilisée pour le contournement. */
  routeKind: ScreenRouteKind | undefined;
  /** Le contact a réutilisé une mémoire de la frame précédente. */
  memoryUsed: boolean;
  /** Point d'ancrage retenu pour le contact écran. */
  contactPoint: Point | undefined;
  /** Défenseur protégé du réalignement instantané par followDefendersAtFrame. */
  locked: boolean;
  /** Engine flags propagés depuis defB. */
  matchedTo: AttackerId;
  late: boolean;
  /** Distance finale parcourue depuis la frame précédente, si disponible. */
  lastJumpPx: number | undefined;
  /** Angle de changement de direction détecté par l'inertie playback. */
  motionTurnDeg: number | undefined;
  /** Intensité d'inertie appliquée à cette frame (0..1). */
  motionInertia: number | undefined;
}

export interface FrameDebug {
  idxA: number;
  idxB: number;
  localT: number;
  defenders: Partial<Record<DefenderId, FrameDecision>>;
}

export type FrameProfilePhase =
  | 'attackers'
  | 'screens'
  | 'obstacles'
  | 'defenders'
  | 'collisions'
  | 'rateLimiter'
  | 'ball';

export interface FrameProfile {
  totalMs: number;
  phases: Record<FrameProfilePhase, number>;
}

export interface ScreenContactMemoryEntry {
  contactKey: string;
  contactKind: 'carrier' | 'off-ball' | undefined;
  contactScreener: AttackerId | undefined;
  contactScreenerDef: DefenderId | undefined;
  contactScreeners: AttackerId[] | undefined;
  activeScreener: AttackerId | undefined;
  contactProgress: number | undefined;
  contactPoint: Point | undefined;
  forcedPushSign: number | undefined;
  routeKind: ScreenRouteKind | undefined;
  quality: number;
  mode: 'arriving' | 'stuck' | 'leaving';
  state: ScreenContactState | undefined;
}

export type ScreenContactMemory = Partial<Record<DefenderId, ScreenContactMemoryEntry>>;

export interface DefenderMotionMemoryEntry {
  velocity: Point;
  turnDeg: number;
  inertia: number;
}

export type DefenderMotionMemory = Partial<Record<DefenderId, DefenderMotionMemoryEntry>>;

export interface PlaybackFrame {
  off: AttackerPositions;
  defPos: ComputedDefense;
  carrier: AttackerId;
  screen: DetectedScreen | null;
  offBallScreens: DetectedOffBallScreen[];
  stepIdx: number;
  ballPos: Point;
  ballInFlight: boolean;
  attVisuals: ComputedAttackerVisuals;
  attackerIsScreening: Partial<Record<AttackerId, boolean>>;
  attackerMovementType: Partial<Record<AttackerId, MovementType>>;
  /** Mémoire courte de contact écran, propagée uniquement par le playback
   *  via `options.prevFrame`. Le scrub pur n'en dépend pas. */
  screenMemory?: ScreenContactMemory;
  /** Mémoire courte de vélocité défensive pour l'inertie playback. */
  motionMemory?: DefenderMotionMemory;
  /** Décisions internes par défenseur, populées uniquement si
   *  `options.collectDecisions` est true. Sinon undefined. */
  debug?: FrameDebug;
  /** Profiling opt-in de `resolveFrameAt`, utile aux tests perf/debug. */
  profile?: FrameProfile;
  /** Phase 1.1 — Équipe qui attaque actuellement. Set seulement via le
   *  live match (sinon défaut 'home'). Utilisé par CourtPlayersLayer
   *  pour masquer les sprites home pendant la phase away. */
  attackingTeam?: 'home' | 'away';
}

export interface ResolveFrameOptions {
  /** Force l'index de step retourné dans la frame. Par défaut : `floor(t)`
   *  (utilisé par le playback continu). Le scrub passe `Math.round(t)`
   *  pour afficher le step le plus proche du curseur. */
  stepIdx?: number;
  /** Frame précédente du playback (frame N-1). Utilisée pour limiter
   *  les sauts de défenseurs > MAX_DEFENDER_JUMP_PX/frame (anti-snap
   *  visuel). Non passé en scrub → rate limiter désactivé.
   *  Cf. docs/SCREEN-ENGINE.md "Bug résiduel" + commit dédié. */
  prevFrame?: PlaybackFrame;
  /** Active la collecte de décisions internes par défenseur (screenMode,
   *  cluster, pushMode). Inflige un petit coût mémoire/CPU ; à n'activer
   *  qu'en tests diagnostic ou en debug dev. */
  collectDecisions?: boolean;
  /** Tests/perf : force le chemin sans cache segmentaire pour comparer
   *  bit-à-bit les sorties du resolver. */
  disableSegmentCache?: boolean;
  /** Active la mesure par phase de `resolveFrameAt`. */
  profile?: boolean;
}

export interface ResolveDeterministicScrubOptions extends ResolveFrameOptions {
  /** Résolution synthétique utilisée pour reconstruire la mémoire de lecture
   *  depuis le début du segment courant. 60 = équivalent playback 60 fps. */
  fps?: number;
}

/** Saut maximum autorisé par frame sur la position d'un défenseur.
 *  À 60 fps : 18 px/frame = 1080 px/s ≈ 29 m/s. Au-delà = snap visuel
 *  (cause typique : screen detection qui change entre frames adjacentes,
 *  Bezier qui flip de côté, adhesion qui change brutalement de blend).
 *  En clamp à cette valeur, le défenseur rattrape son retard en ~5 frames
 *  (= 80ms) sur un saut de 90 px. Imperceptible visuellement. */
const MAX_DEFENDER_JUMP_PX = 18;

/** Saut maximum autorisé par frame sur la position d'un attaquant.
 *  Identique aux défenseurs : 18 px/frame = 1080 px/s ≈ 29 m/s. Un cut basket
 *  réel à 7 m/s ≈ 4.4 px/frame, largement sous le seuil. Borne les pics
 *  de `curveAroundObstacle` quand le cluster bouge (cause du jump O2 mi-Pindown). */
const MAX_ATTACKER_JUMP_PX = 18;

/** Démarre l'inertie quand le défenseur change fortement de direction.
 *  cos(70°) ≈ 0.34 : sous ce seuil, le virage devient visible à l'oeil. */
const DEFENDER_INERTIA_MIN_SPEED_PX = 0.6;
const DEFENDER_INERTIA_FAST_TURN_START_COS = 0.20;
const DEFENDER_INERTIA_SLOW_TURN_START_COS = 0.50;
const DEFENDER_INERTIA_FAST_MAX_BLEND = 0.18;
const DEFENDER_INERTIA_SLOW_MAX_BLEND = 0.36;
const DEFENDER_INERTIA_FAST_SPEED_LOSS = 0.32;
const DEFENDER_INERTIA_SLOW_SPEED_LOSS = 0.55;
const INTERPOLATED_FRAME_CLEARANCE_PX = PLAYER_MIN_CLEARANCE_PX * 0.72;

interface SegmentScreenStatic {
  matchupsA: Matchups;
  matchupsB: Matchups;
  ctxA: ScreenContext;
  ctxB: ScreenContext;
  ctxAExit: ScreenContext;
  ctxBExit: ScreenContext;
  screenerObstacles: ScreenObstacle[];
}

interface SegmentScreenCacheEntry {
  deps: string;
  value: SegmentScreenStatic;
}

const segmentScreenCache = new WeakMap<AppState, Map<string, SegmentScreenCacheEntry>>();

/**
 * Version scrub déterministe : au lieu de résoudre `t` isolément, reconstruit
 * les frames du début du segment courant (`floor(t)`) jusqu'à `t` en chaînant
 * `prevFrame`. Le résultat est reproductible à chaque appel, mais bénéficie
 * des mêmes stabilisateurs que le playback continu.
 */
export function resolveFrameAtDeterministicScrub(
  state: AppState,
  t: number,
  options: ResolveDeterministicScrubOptions = {}
): PlaybackFrame | null {
  const totalSteps = state.steps.length - 1;
  if (totalSteps <= 0) return null;

  const clamped = Math.max(0, Math.min(totalSteps, t));
  const idxA = Math.floor(clamped);
  // D.1 — easing visuel appliqué au localT. Default 'linear' = identité.
  const localT = applyEasing(clamped - idxA, state.movementEasing);
  const fps = Math.max(1, Math.round(options.fps ?? 60));
  const { fps: _fps, ...baseOptions } = options;

  if (localT <= 0.000001) {
    if (idxA <= 0) return resolveFrameAt(state, clamped, baseOptions);
    return resolveDeterministicSegment(state, idxA - 1, 1, fps, baseOptions);
  }

  return resolveDeterministicSegment(state, idxA, localT, fps, baseOptions);
}

function resolveDeterministicSegment(
  state: AppState,
  idxA: number,
  localT: number,
  fps: number,
  baseOptions: ResolveFrameOptions
): PlaybackFrame | null {
  const stepIdx = baseOptions.stepIdx;
  const startT = idxA;
  let prevFrame = idxA > 0
    ? resolveDeterministicSegment(state, idxA - 1, 1, fps, baseOptions)
    : resolveFrameAt(state, startT, {
        ...baseOptions,
        stepIdx,
      });
  if (!prevFrame) return null;
  if (localT <= 0.000001) return prevFrame;

  const wholeFrames = Math.floor(localT * fps + 1e-9);
  for (let i = 1; i <= wholeFrames; i++) {
    const sampleLocalT = i / fps;
    const sampleT = idxA + sampleLocalT;
    const frame = resolveFrameAt(state, sampleT, {
      ...baseOptions,
      stepIdx,
      prevFrame,
    });
    if (!frame) return prevFrame;
    prevFrame = frame;
  }

  if (Math.abs(wholeFrames / fps - localT) > 0.000001) {
    const frame = resolveFrameAt(state, idxA + localT, {
      ...baseOptions,
      stepIdx,
      prevFrame,
    });
    if (!frame) return prevFrame;
    prevFrame = frame;
  }

  return prevFrame;
}

/**
 * Résout la frame complète à l'instant `t` (en unités de step fractionnaires).
 * `t` est clampé à [0, steps.length - 1]. Retourne `null` si le scénario n'a
 * pas au moins 2 étapes (pas d'interpolation possible).
 */
export function resolveFrameAt(
  state: AppState,
  t: number,
  options: ResolveFrameOptions = {}
): PlaybackFrame | null {
  const profiler = options.profile ? createFrameProfiler() : null;
  const totalSteps = state.steps.length - 1;
  if (totalSteps <= 0) return null;

  const clamped = Math.max(0, Math.min(totalSteps, t));
  const idxA = Math.floor(clamped);
  const idxB = Math.min(idxA + 1, totalSteps);
  // D.1 — easing visuel appliqué au localT. Default 'linear' = identité.
  const localT = applyEasing(clamped - idxA, state.movementEasing);

  const a = state.steps[idxA];
  const b = state.steps[idxB];
  const offA = activeOffense(a.off, state.playerCount);
  const offB = activeOffense(b.off, state.playerCount);
  const defA = effectiveDefensePositions(state, idxA);
  const defB = effectiveDefensePositions(state, idxB);

  const attackerIds = Object.keys(offA) as AttackerId[];
  const defenderIds = Object.keys(defA) as DefenderId[];

  // ---------------------------------------------------------------------
  // 1. Positions attaquants — trajectoire pilotée par les annotations,
  //    avec évitement d'obstacles uniquement pour cut/idle.
  // ---------------------------------------------------------------------
  const off = {} as AttackerPositions;
  const attackerMovementType: Partial<Record<AttackerId, MovementType>> = {};
  const attackerIsScreening: Partial<Record<AttackerId, boolean>> = {};
  attackerIds.forEach((id) => {
    const traj = attackerTrajectoryAt(
      state.steps,
      idxA,
      id,
      localT,
      // B.4 — fournir la durée per-step pour que resolveAnnotationTiming
      // puisse traiter tStartAbs/tEndAbs en secondes absolues.
      (idx) => getStepDurationSeconds(state, idx),
      // Phy.O — profil de vitesse offensif (opt-in).
      {
        enabled: !!state.attackerVelocityProfileEnabled,
        tierFor: (attId) => state.attackerSpeedProfiles?.[attId],
        obstaclesFor: (attId) => {
          const obs: Point[] = [];
          // Autres attaquants à t=0.5 (interp linéaire des positions
          // de step). Exclut soi-même.
          attackerIds.forEach((other) => {
            if (other === attId) return;
            const oA = a.off[other];
            const oB = b.off[other];
            if (!oA || !oB) return;
            obs.push({ x: (oA.x + oB.x) * 0.5, y: (oA.y + oB.y) * 0.5 });
          });
          // Tous les défenseurs à t=0.5.
          defenderIds.forEach((dId) => {
            const dA = defA[dId];
            const dB = defB[dId];
            if (!dA || !dB) return;
            obs.push({ x: (dA.x + dB.x) * 0.5, y: (dA.y + dB.y) * 0.5 });
          });
          return obs;
        },
        // Phy.O V3 V1 — matched defender mid-segment, seulement si le
        // flag dédié est activé (A/B séparé du flag profil de vitesse).
        matchedDefenderFor: state.attackerActiveDemarquage
          ? (attId) => {
              const matchups = getMatchupsAt(state.steps, idxA, state.playerCount);
              const dId = (Object.keys(matchups) as DefenderId[]).find(
                (d) => matchups[d] === attId,
              );
              if (!dId) return undefined;
              const dA = defA[dId];
              const dB = defB[dId];
              if (!dA || !dB) return undefined;
              return { x: (dA.x + dB.x) * 0.5, y: (dA.y + dB.y) * 0.5 };
            }
          : undefined,
        // Phy.O V3 V4 — boost post-feinte activé par le même flag V3 V1.
        postFeinteBoost: !!state.attackerActiveDemarquage,
      },
    );
    attackerMovementType[id] = traj.movementType;
    attackerIsScreening[id] = traj.isScreening;
    let p = traj.position;

    // Évitement d'obstacles : appliqué pour TOUS les types de mouvement
    // (cut, idle, dribble). Avant : seulement cut/idle ; conséquence — un
    // porteur en dribble dont la trajectoire passe pile sur un autre joueur
    // se faisait pousser violemment par le solveur d'anti-superposition en
    // 1.b (jusqu'à 30 px en 1 frame, effet de téléport visible à f435/436
    // dans le Screen Lab). En courbant LA TRAJECTOIRE en amont via une
    // Bezier autour de l'obstacle, le dribble dévie en douceur — plus de
    // snap. Le `screen` movementType reste exclu : le poseur DOIT atteindre
    // sa position de pose, pas l'éviter.
    if (
      traj.movementType === 'cut' ||
      traj.movementType === 'idle' ||
      traj.movementType === 'dribble'
    ) {
      const obstacles: ScreenObstacle[] = [];
      attackerIds.forEach((other) => {
        if (other === id) return;
        obstacles.push({
          center: midpoint(offA[other], offB[other]),
          radius: PLAYER_OBSTACLE_RADIUS_PX,
          defenderToSkip: 'D1' as DefenderId,
        });
      });
      defenderIds.forEach((dId) => {
        obstacles.push({
          center: midpoint(defA[dId], defB[dId]),
          radius: PLAYER_OBSTACLE_RADIUS_PX,
          defenderToSkip: 'D1' as DefenderId,
        });
      });
      const blocking = pickBlockingCluster(offA[id], offB[id], obstacles);
      if (blocking) {
        p = curveAroundObstacle(offA[id], offB[id], blocking.center, blocking.radius, localT);
      }
    }

    off[id] = p;
  });

  // 1.b — Anti-superposition attaquant ↔ attaquant pendant l'interpolation.
  // Sans ce solveur, deux attaquants dont les trajectoires SE CROISENT (ex :
  // O1 dribble vers la droite + O3 vient poser un écran au milieu) peuvent
  // être visuellement empilés à mi-segment. La règle absolue
  // (cf. docs/PLAYER-CLEARANCE.md) interdit toute superposition, frame par
  // frame. On itère 5 passes (suffisant pour 5 attaquants).
  for (let iter = 0; iter < 5; iter++) {
    let moved = false;
    for (const id of attackerIds) {
      if (attackerIsScreening[id]) continue;
      const p = off[id];
      const obstacles: Point[] = [];
      for (const other of attackerIds) {
        if (other !== id) obstacles.push(off[other]);
      }
      const pushed = pushOutOfMany(p, obstacles, PLAYER_MIN_CLEARANCE_PX);
      if (Math.abs(pushed.x - p.x) > 0.1 || Math.abs(pushed.y - p.y) > 0.1) {
        off[id] = pushed;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // 1.c — Rate limiter sur attaquants : clamp les sauts > MAX_ATTACKER_JUMP_PX
  // par frame. Évite que `curveAroundObstacle` produise des pics quand le
  // cluster d'obstacles bouge (cause d'un saut > 20 px sur O2 mi-Pindown).
  // Appliqué APRÈS le solveur anti-superposition (qui peut avoir lui-même
  // injecté un déplacement) et AVANT le calcul défenseur (qui dépend des
  // positions attaquantes finales).
  if (options.prevFrame) {
    const prevOff = options.prevFrame.off;
    attackerIds.forEach((id) => {
      if (attackerIsScreening[id]) return;
      const p0 = prevOff[id];
      const p1 = off[id];
      if (!p0 || !p1) return;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const d = Math.hypot(dx, dy);
      if (d > MAX_ATTACKER_JUMP_PX) {
        const k = MAX_ATTACKER_JUMP_PX / d;
        off[id] = { x: p0.x + dx * k, y: p0.y + dy * k };
      }
    });
  }
  profiler?.lap('attackers');

  // ---------------------------------------------------------------------
  // 2. Porteur courant + détection d'écrans (uniquement en man-to-man).
  // ---------------------------------------------------------------------
  const carrierA = activeBallCarrier(a, state.playerCount);
  const carrierB = activeBallCarrier(b, state.playerCount);
  let ctxA: ScreenContext = emptyScreenContext();
  let ctxB: ScreenContext = emptyScreenContext();
  let ctxAExit: ScreenContext = emptyScreenContext();
  let ctxBExit: ScreenContext = emptyScreenContext();
  let currentCtx: ScreenContext = emptyScreenContext();
  let segmentStatic: SegmentScreenStatic | null = null;
  // STABILISATION DU CARRIER : on n'utilise PLUS le switch à t=0.5
  // (`carrier = localT < 0.5 ? carrierA : carrierB`) qui créait un saut de
  // contexte à mi-segment lors d'une passe. On prend systématiquement le
  // carrier de DESTINATION (carrierB) pour toute la transition. La balle
  // visuellement vole d'A à B via `computeBallFrame`, indépendamment du
  // flag carrier. Le contexte d'écran reste cohérent pendant tout le
  // segment ; les détections endpoints (screenA/B) couvrent les deux cas.
  const carrier = carrierB;
  let screen: DetectedScreen | null = null;
  let offBallScreens: DetectedOffBallScreen[] = [];
  if (state.defenseSystem === 'man') {
    segmentStatic = getSegmentScreenStatic({
      state,
      idxA,
      idxB,
      offA,
      offB,
      defA,
      defB,
      carrierA,
      carrierB,
      stepA: a,
      stepB: b,
      disableCache: !!options.disableSegmentCache,
    });
    ctxA = segmentStatic.ctxA;
    ctxB = segmentStatic.ctxB;
    ctxAExit = segmentStatic.ctxAExit;
    ctxBExit = segmentStatic.ctxBExit;

    const matchups = segmentStatic.matchupsB;
    const defPosLinear = {} as Record<DefenderId, Point>;
    defenderIds.forEach((id) => {
      defPosLinear[id] = lerpPoint(defA[id], defB[id], localT);
    });
    const detectionPos: Record<DefenderId, Point> = (idxA === 0 && idxB === 0)
      ? buildStep0DetectionPositions(state, off, carrier, matchups, defPosLinear)
      : defPosLinear;
    // forcedScreener pris UNIQUEMENT sur step B (pas de bascule à t=0.5).
    const forced = b.forcedScreener;
    currentCtx = detectScreenContext({
      off,
      carrier,
      matchups,
      defenderPositions: detectionPos,
      screenRadius: state.screenRadius,
      forcedScreener: forced,
    });
    screen = currentCtx.screen;
    offBallScreens = currentCtx.offBallScreens;
  }
  profiler?.lap('screens');

  // ---------------------------------------------------------------------
  // 3. Obstacles "cluster" (poseur + son défenseur) pour contourner les
  //    écrans pendant le segment. Position MOYENNE A↔B → obstacle stable.
  // ---------------------------------------------------------------------
  const screenerObstacles: ScreenObstacle[] = segmentStatic
    ? [...segmentStatic.screenerObstacles]
    : [];
  // Clusters d'écran (porteur + off-ball) construits UNIQUEMENT depuis les
  // détections STABLES aux endpoints (screenA, screenB), pas depuis la
  // détection courante interpolée `screen`. Pourquoi :
  //  - `screen` (interpolé) peut fire par intermittence pendant le scrub
  //    si D1 et le poseur se croisent géométriquement mid-segment
  //  - Conséquence : `screenerObstacles` apparaît/disparaît au scrub →
  //    `curveAroundObstacle` apparaît/disparaît → D1 saute visuellement
  //    (cas reproduit avec systeme_basket-8.json où O3 se déplace de 140px
  //    pendant le segment)
  // En n'utilisant que les endpoints, le cluster est soit présent toute la
  // transition (screen détecté à un endpoint), soit absent toute la
  // transition. Pas de flicker.
  profiler?.lap('obstacles');

  // ---------------------------------------------------------------------
  // 4. Positions défenseurs — interpolation linéaire + courbe d'évitement.
  // ---------------------------------------------------------------------
  const defPos = {} as ComputedDefense;
  const defenseHoop = getDefenseHoop(state);
  // Défenseurs dont la position vient d'être calculée avec freeze/courbe/
  // easing (phase de contact d'écran). `followDefendersAtFrame` doit les
  // SAUTER, sinon il réécrit la position en suivant l'homme et annule tout
  // le réalisme du contact.
  const screenLockedDefenders = new Set<DefenderId>();
  const decisions: Partial<Record<DefenderId, FrameDecision>> | null = options.collectDecisions
    ? {}
    : null;
  const prevScreenMemory = options.prevFrame?.screenMemory;
  const nextScreenMemory: ScreenContactMemory = {};
  defenderIds.forEach((id) => {
    const candidates = screenerObstacles.filter((o) => id !== o.defenderToSkip);

    // Détection du mode de contact d'écran pour ce défenseur. La transition
    // peut être :
    //  - 'arriving' (defB onScreen, defA pas) : D1 atteint le poseur et y
    //    reste figé pendant la queue de la transition.
    //  - 'leaving' (defA onScreen, defB pas) : D1 vient de se libérer ; on
    //    le maintient figé au départ puis il rattrape.
    //  - 'stuck' (both onScreen) : encore plaqué — freeze au milieu.
    // Stable : on prend uniquement defB pour ce flag (le step de destination).
    // Le OR avec defA créait un saut de contexte mid-segment quand un défenseur
    // changeait de rôle (carrier↔off-ball) pendant la transition (ex passe).
    const isCarrierDef = defB[id].isCarrierDefender;
    const contact = defenderScreenContact({
      state,
      defenderId: id,
      isCarrierDef,
      ctxA,
      ctxB,
      ctxAExit,
      ctxBExit,
      currentCtx,
      idxA,
      idxB,
    });
    const screenMode = contact.mode;
    const modeQuality = contact.quality;
    const prevAnyMemory = prevScreenMemory?.[id];
    const prevMemory = contact.contactKey ? prevAnyMemory : undefined;
    const sameContactMemory = !!prevMemory && prevMemory.contactKey === contact.contactKey;
    let memoryUsed = false;
    let contactPointForMemory: Point | undefined;
    let contactScreenersForMemory: AttackerId[] | undefined = contact.offBallContact
      ? offBallScreeners(contact.offBallContact).map((s) => s.screener)
      : contact.contactScreener ? [contact.contactScreener] : undefined;
    let activeScreenerForMemory: AttackerId | undefined = contact.contactScreener;
    let contactProgressForMemory: number | undefined;
    // Time-remap sigmoïdal qui FIGE D1 sur le poseur (smooth, sans
    // discontinuité de vélocité). Pour les autres défenseurs ou hors
    // écran, identité = localT.
    let effT = screenContactT(localT, modeQuality, screenMode);
    // C.1 — Closeout footwork : si ce défenseur est en closeout et PAS
    // déjà en screen mode (le screen easing prime), applique un easing
    // sprint(65 %) puis freinage(35 %) sur la transition. Visuellement :
    // il s'élance fort, arrive "in control" avec bras hauts.
    // Cf. `lib/logic/closeoutEasing.ts`.
    if (!screenMode && defB[id].closingOut) {
      effT = closeoutEasing(effT);
    }
    // Décision de verrouillage contre followDefendersAtFrame. Plusieurs
    // conditions cumulatives pour assurer la continuité visuelle :
    const isInRecoveryA = defA[id].screenPhase === 'recover' && defA[id].late;
    const isInRecoveryB = defB[id].screenPhase === 'recover' && defB[id].late;
    const isImpactA = defA[id].screenPhase === 'impact';
    const isImpactB = defB[id].screenPhase === 'impact';
    const screenState = resolveScreenContactState({
      mode: screenMode,
      localT,
      quality: modeQuality,
      hadRecentContact: !!prevAnyMemory,
      engineRecover: isInRecoveryA || isInRecoveryB,
      engineImpact: isImpactA || isImpactB,
    });
    const phase = screenState.visualPhase;
    // Annotation utilisateur dans step A ou B (poseur slip non détecté
    // par la géométrie). Ne lock que pour le défenseur du porteur.
    const hasUserScreen = isCarrierDef &&
      (hasCarrierScreenAnnotation(a, carrierA) || hasCarrierScreenAnnotation(b, carrierB));
    // Hystérésis qualité : entrer en contact demande un peu plus de signal
    // que rester en contact. Ça évite le flicker lock/unlock quand le poseur
    // flirte avec le rayon de détection ou qu'un double écran change de score
    // d'une frame à l'autre.
    const wasScreenActive = contact.carrierContactA || !!contact.offBallContactA || isInRecoveryA || isImpactA;
    const meaningfulQuality = screenContactQualityPassesHysteresis(modeQuality, wasScreenActive);
    if ((screenMode && meaningfulQuality) || hasUserScreen ||
        ((isInRecoveryA || isInRecoveryB || isImpactA || isImpactB) && meaningfulQuality)) {
      screenLockedDefenders.add(id);
    }

    let p = lerpPoint(defA[id], defB[id], effT);

    // Le défenseur du porteur qui prend l'écran subit un easing FORT au
    // sommet du contournement quand sa ligne croise un cluster, modulé par
    // la qualité de l'écran. Cumulé avec le freeze ci-dessus pour des
    // transitions vraiment palpables.
    const apexSlowness = screenMode
      ? carrierApexSlownessFromQuality(modeQuality)
      : 0.3;
    const carrierRouteRule = contact.carrierContact && contact.carrierScreen
      ? effectiveScreenRuleForDef(state, contact.carrierScreen.carrierDef)
      : undefined;
    const routeKind: ScreenRouteKind | undefined = carrierRouteRule
      ? carrierScreenRouteKind(carrierRouteRule)
      : contact.offBallContact
        ? offBallScreenRouteKind(state.offBallScreenRule)
        : undefined;
    const routePreference = contact.carrierContact && contact.carrierScreen && carrierRouteRule
      ? carrierScreenRoutePreference(
          carrierRouteRule,
          contact.carrierScreen,
          off,
          defenseHoop
        )
      : contact.offBallContact
        ? offBallScreenRoutePreference(
            contact.offBallContact,
            state.offBallScreenRule,
            off[carrier],
            defenseHoop
          )
        : null;
    let forcedPushSign = routePreference
      ? forcedPushSignForRoute(defA[id], defB[id], routePreference)
      : undefined;
    // Override pour mode 'stuck' : si defA et defB sont de côtés OPPOSÉS du
    // poseur, le forcedPushSign basé sur la rule peut router D1 via la rule
    // (ex hedge → awayFromHoop) au lieu de respecter le côté où il était.
    // Conséquence visuelle : D1 plaqué à gauche du poseur saute à droite
    // d'un coup en passant à travers le cluster. Fix : forcer le côté à
    // matcher celui de defA (où D1 EST déjà), assure que le contournement
    // se fait dans la continuité.
    if (screenMode === 'stuck' && screenerObstacles.length > 0) {
      const obs = screenerObstacles[0];
      const segDx = defB[id].x - defA[id].x;
      const segDy = defB[id].y - defA[id].y;
      const segLen = Math.hypot(segDx, segDy);
      if (segLen > 0.01) {
        const perpX = -segDy / segLen;
        const perpY = segDx / segLen;
        const aToO = { x: obs.center.x - defA[id].x, y: obs.center.y - defA[id].y };
        const aSide = aToO.x * perpX + aToO.y * perpY;
        // Si defA est du côté +perp (aSide > 0), pushSign doit être -1 pour
        // que le contournement aille DE L'AUTRE côté (sinon D1 se fait
        // pousser dans le poseur). Convention de curveAroundObstacle :
        // pushSign correspond au côté du point de contrôle.
        forcedPushSign = aSide >= 0 ? -1 : 1;
      }
    }
    if (sameContactMemory && prevMemory.forcedPushSign !== undefined && screenMode !== 'leaving') {
      forcedPushSign = prevMemory.forcedPushSign;
      memoryUsed = true;
    }
    // Pendant la phase 'leaving' (recover), D1 ne doit PAS être routé autour
    // du poseur via Bezier — il sort du contact en ligne droite vers sa nouvelle
    // cible. La Bezier en recovery faisait orbiter D1 vers le côté OPPOSÉ
    // au stuck point (selon forcedPushSign), créant le bug "il rattrape le
    // retard à l'opposé du cercle puis revient".
    const allowCurve = screenMode !== 'leaving';
    const pair = allowCurve ? pickStaggeredPair(defA[id], defB[id], candidates) : null;
    let singleClusterForSideConstraint: ScreenObstacle | null = null;
    let curveBranch: FrameDecision['curveBranch'] = 'none';
    let clusterId: string | undefined;
    if (pair) {
      p = curveAroundStaggeredPair(defA[id], defB[id], pair[0], pair[1], effT);
      curveBranch = 'staggered-pair';
      clusterId = matchClusterToScreenObstacle(pair[0], candidates) ?? clusterPositionLabel(pair[0]);
    } else if (allowCurve) {
      const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
      if (blocking) {
        p = curveAroundObstacle(
          defA[id],
          defB[id],
          blocking.center,
          blocking.radius,
          effT,
          apexSlowness,
          forcedPushSign
        );
        // Mémorise le cluster pour la stabilisation de côté plus bas. Uniquement
        // si pair est null (= un seul cluster). En stagger, la trajectoire passe
        // entre les 2 poseurs et la contrainte de demi-plan ferait sortir D du
        // contact souhaité.
        const matched = candidates.find((c) =>
          Math.abs(c.center.x - blocking.center.x) < 0.01 &&
          Math.abs(c.center.y - blocking.center.y) < 0.01
        );
        if (matched) singleClusterForSideConstraint = matched;
        curveBranch = 'single-blocking';
        clusterId = matched?.defenderToSkip ?? clusterPositionLabel(blocking);
      }
    }
    const adhesion = screenContactAdhesion(localT, modeQuality, screenMode);
    if (adhesion > 0 && screenMode) {
      // Position du poseur FIGÉE au moment du contact (pas l'interpolation
      // courante). En basket réel, D1 reste où il s'est fait bumper — il
      // ne suit pas le poseur qui slip ou roll après l'impact. Sans cet
      // ancrage, si le poseur traverse l'axe defA→defB pendant le segment,
      // contactPoint flip de côté → D1 saute visuellement.
      //  - leaving : impact au début (idxA) → utiliser offA
      //  - arriving / stuck : impact à la fin (idxB) → utiliser offB
      // ANCRAGE du point de contact, STABLE pour toute la transition :
      //  - arriving : anchor = defB (position stuck à la fin). D1 va vers
      //    le contact, le côté est fixé par où il se retrouvera plaqué.
      //  - leaving : anchor = defA (position stuck au début). D1 quitte
      //    le contact, le côté est fixé par où il était plaqué.
      //  - stuck : anchor = midpoint(defA, defB). D1 est plaqué tout au
      //    long, on prend une moyenne stable.
      // Sans ancrage stable, contactPoint = radialContactPoint(p, screener)
      // flippait quand p traversait l'autre côté du poseur (orbite Bezier
      // ou lerp vers une nouvelle position carrier).
      const anchor = screenMode === 'leaving'
        ? defA[id]
        : screenMode === 'arriving'
          ? defB[id]
          : midpoint(defA[id], defB[id]);
      const contactScreener = screenContactScreenerPoint({
        contact,
        mode: screenMode,
        localT,
        offA,
        offB,
        stepA: state.steps[idxA],
        stepB: state.steps[idxB],
        ctxA,
        ctxB,
        anchor,
      });
      if (contactScreener) {
        const contactOff = screenMode === 'leaving' ? offA : offB;
        const advancedContact = offBallAdvancedContactGeometry(
          contact.offBallContact,
          contactOff,
          anchor,
          localT
        );
        if (advancedContact) {
          contactScreenersForMemory = advancedContact.screeners;
          activeScreenerForMemory = advancedContact.activeScreener;
          contactProgressForMemory = advancedContact.progress;
        }
        const rawContactPoint = advancedContact?.contactPoint ?? radialContactPoint(anchor, contactScreener);
        const canStabilizeFromMemory = sameContactMemory &&
          !!prevMemory.contactPoint &&
          advancedContact?.kind !== 'elevator';
        const contactPoint = canStabilizeFromMemory
          ? stabilizeContactPointFromMemory(rawContactPoint, prevMemory.contactPoint!, contactScreener)
          : rawContactPoint;
        if (contactPoint !== rawContactPoint) memoryUsed = true;
        contactPointForMemory = contactPoint;
        const release = screenContactTangentRelease(localT, modeQuality, screenMode);
        const releasePoint = release > 0
          ? advancedContact
            ? offBallAdvancedReleasePoint(advancedContact, contactPoint, defB[id], release, modeQuality)
            : tangentReleasePoint(contactPoint, contactScreener, defB[id], release, modeQuality)
          : contactPoint;
        p = lerpPoint(p, releasePoint, adhesion);
      }
    }
    if (screenMode && contact.contactKey && meaningfulQuality) {
      nextScreenMemory[id] = {
        contactKey: contact.contactKey,
        contactKind: contact.contactKind,
        contactScreener: contact.contactScreener,
        contactScreenerDef: contact.contactScreenerDef,
        contactScreeners: contactScreenersForMemory,
        activeScreener: activeScreenerForMemory,
        contactProgress: contactProgressForMemory,
        contactPoint: contactPointForMemory,
        forcedPushSign,
        routeKind,
        quality: modeQuality,
        mode: screenMode,
        state: screenState.state,
      };
    }
    // Anti-superposition pour défenseurs en screen lock : single-pass
    // pushOutOfMany contre TOUS les attaquants (matched compris, règle
    // absolue cf. PLAYER-CLEARANCE.md). `resolvePlayerCollisions` plus bas
    // skippe ces défenseurs pour éviter le flicker côté-à-côté ; mais
    // l'adhesion peut produire une position à < 34 px d'un attaquant
    // non-matched (typiquement le poseur), il faut compenser ici.
    // Single pass = pas d'oscillation = pas de flicker.
    let pushMode: FrameDecision['pushMode'] = 'skipped';
    if (screenLockedDefenders.has(id) || (screenMode && contact.carrierContact) || contact.offBallContact) {
      const obs: Point[] = [];
      for (const aId of attackerIds) obs.push(off[aId]);
      // STABILISATION CÔTÉ ÉCRAN — pushOutOfMany "naïf" peut converger sur 2
      // fixed points opposés autour du cluster du poseur quand D est coincé
      // entre 2 attaquants (poseur + son homme) dont l'écart est < 2 ×
      // MIN_CLEARANCE. Cas reproduit sur UCLA cut entre f113 et f114 :
      // O5 poseur (309,240) et O1 cutter (298,201) à ~62 px → pas de point
      // valide à 34 px des deux. Le choix du fixed point dépend de l'ordre
      // d'itération et flippe au moindre changement de position inter-frame
      // → saut visuel ~50 px (D traverse le poseur).
      //
      // Fix : quand on a UN SEUL cluster d'écran ayant déclenché la Bezier
      // de contournement, on contraint chaque push à ne pas franchir le
      // segment defA→defB vers le côté du cluster. Sur stagger (2 poseurs,
      // pair non-null), on utilise pushOutOfMany classique car la trajectoire
      // peut légitimement passer entre les 2 poseurs.
      if (singleClusterForSideConstraint) {
        const solved = pushOutOfScreenContact({
          point: p,
          obstacles: obs,
          minDist: PLAYER_MIN_CLEARANCE_PX,
          segmentStart: defA[id],
          segmentEnd: defB[id],
          clusterCenter: singleClusterForSideConstraint.center,
        });
        p = solved.point;
        pushMode = solved.mode === 'constrained' ? 'constrained' : 'naive';
      } else {
        p = pushOutOfMany(p, obs, PLAYER_MIN_CLEARANCE_PX);
        pushMode = 'naive';
      }
    }
    if (decisions) {
      decisions[id] = {
        screenMode,
        screenState: screenState.state,
        quality: modeQuality,
        contactKey: contact.contactKey,
        contactKind: contact.contactKind,
        contactScreener: contact.contactScreener,
        contactScreenerDef: contact.contactScreenerDef,
        contactScreeners: contactScreenersForMemory,
        activeScreener: activeScreenerForMemory,
        carrierContact: contact.carrierContact,
        offBallContactType: contact.offBallContact?.type,
        curveBranch,
        clusterId,
        pushMode,
        forcedPushSign,
        routeKind,
        memoryUsed,
        contactPoint: contactPointForMemory,
        locked: screenLockedDefenders.has(id),
        matchedTo: defB[id].matchedTo,
        late: defB[id].late,
        lastJumpPx: undefined,
        motionTurnDeg: undefined,
        motionInertia: undefined,
      };
    }
    defPos[id] = {
      x: p.x,
      y: p.y,
      late: defB[id].late,
      helpFactor: defB[id].helpFactor,
      isCarrierDefender: defB[id].isCarrierDefender,
      matchedTo: defB[id].matchedTo,
      onScreen: defB[id].onScreen,
      switchedThisStep: defB[id].switchedThisStep,
      closingOut: defB[id].closingOut,
      overClosed: defB[id].overClosed,
      denying: defB[id].denying,
      helpTriggered: defB[id].helpTriggered,
      screenPhase: phase ?? defB[id].screenPhase,
      orientation: lerpAngleDeg(defA[id].orientation, defB[id].orientation, localT),
      gazeOrientation: lerpAngleDeg(defA[id].gazeOrientation, defB[id].gazeOrientation, localT),
      facing: lerpPoint(defA[id].facing, defB[id].facing, localT),
      armBallSide: lerpPoint(defA[id].armBallSide, defB[id].armBallSide, localT),
      armManSide: lerpPoint(defA[id].armManSide, defB[id].armManSide, localT),
    };
  });
  profiler?.lap('defenders');

  // ---------------------------------------------------------------------
  // 5. Suivi en temps réel des défenseurs sur leur homme + résolution de
  //    collisions strictes + ré-orientation finale.
  // ---------------------------------------------------------------------
  followDefendersAtFrame(defPos, off, carrier, state, idxA, idxB, screenLockedDefenders);
  // 5.0 — PAI V1 (opt-in) : Path-Aware Interpolation. Détecte les paires
  // de joueurs qui s'effleurent (< MIN_CLEARANCE + 8 px) à la frame
  // courante et applique une déviation tangentielle cappée à 4 px/frame.
  // Skip les poseurs pinnés (attackerIsScreening) et les défenseurs stuck
  // (screenLockedDefenders) — Règle 1bis préservée.
  // Le solveur final (resolvePlayerCollisions) reste filet dur en aval.
  if (state.pathAwareInterpolation) {
    const defPositions: Record<string, Point> = {};
    defenderIds.forEach((id) => {
      defPositions[id] = { x: defPos[id].x, y: defPos[id].y };
    });
    const pai = applyPathAwareInterpolation(
      off,
      defPositions as Record<DefenderId, Point>,
      attackerIsScreening,
      screenLockedDefenders,
      { maxDeviation: state.paiMaxDeviation },
    );
    // Réinjection des positions ajustées
    (Object.keys(pai.attackers) as AttackerId[]).forEach((id) => {
      const p = pai.attackers[id];
      if (p) off[id] = p;
    });
    defenderIds.forEach((id) => {
      const p = pai.defenders[id];
      if (p) {
        defPos[id].x = p.x;
        defPos[id].y = p.y;
      }
    });
  }
  // Anti-superposition pendant l'interpolation. Les défenseurs "stuck" sur
  // un écran (`screenLockedDefenders`) sont SKIP : leurs positions endpoints
  // (engine) sont déjà à ≥ MIN_CLEARANCE de tous les joueurs ; les pousser
  // ici crée du flicker visuel quand l'obstacle interpolé se déplace.
  // La clearance attaquant↔attaquant est elle gérée plus haut (étape 1.b).
  resolvePlayerCollisions(
    defPos as unknown as Record<string, ComputedDefense[DefenderId]>,
    off,
    PLAYER_MIN_CLEARANCE_PX,
    8,
    screenLockedDefenders
  );
  const motionResult = options.prevFrame
    ? applyDefenderMotionInertia({
        state,
        idxA,
        idxB,
        defPos,
        prevFrame: options.prevFrame,
        defenderIds,
        lockedDefenders: screenLockedDefenders,
        decisions,
      })
    : undefined;
  if (motionResult?.applied) {
    resolvePlayerCollisions(
      defPos as unknown as Record<string, ComputedDefense[DefenderId]>,
      off,
      PLAYER_MIN_CLEARANCE_PX,
      4,
      screenLockedDefenders
    );
  }
  profiler?.lap('collisions');

  // 5.c — D.4 — Routage défensif anticipé (opt-in). Pour les défenseurs hors
  // contact d'écran, hors rotation PnR, hors closeout et hors override
  // manuel, on remplace la position interpolée droite par une route qui
  // contourne les autres joueurs. Les endpoints (defA/defB) sont inchangés —
  // seule la trajectoire entre eux courbe. Injecté ICI, APRÈS
  // `followDefendersAtFrame` et `applyDefenderMotionInertia`, et AVANT le
  // rate limiter + la passe finale de collisions (cf.
  // docs/d4-pathfinding-plan.md « Injection »). Placé plus haut dans la
  // boucle de lerp, `followDefendersAtFrame` écraserait la position routée.
  // Le closeout est exclu : c'est un sprint direct sur le porteur, dont le
  // timing (easing sprint/freinage `effT`) ne doit pas être réécrit par un
  // ré-échantillonnage de route en `localT`. Obstacles échantillonnés au
  // milieu de segment (t=0.5) → route déterministe, calculable une fois
  // par segment.
  if (state.defensiveRouting) {
    defenderIds.forEach((id) => {
      if (
        screenLockedDefenders.has(id) ||
        defB[id].pnrRole ||
        defB[id].closingOut ||
        state.steps[idxB]?.defenseOverrides?.[id]
      ) {
        return;
      }
      const routeObstacles: RouteObstacle[] = [];
      // Les autres défenseurs sont ajoutés comme obstacles. Un défenseur
      // verrouillé sur un écran est un obstacle physique réel : on le garde
      // — c'est VOULU, un futur lecteur ne doit pas le « corriger ».
      defenderIds.forEach((other) => {
        if (other === id) return;
        routeObstacles.push({
          center: lerpPoint(defA[other], defB[other], 0.5),
          radius: PLAYER_MIN_CLEARANCE_PX,
        });
      });
      const matchedAtt = defB[id].matchedTo;
      (Object.keys(offA) as AttackerId[]).forEach((oId) => {
        if (oId === matchedAtt || attackerIsScreening[oId]) return;
        const oa = offA[oId];
        const ob = offB[oId];
        if (!oa || !ob) return;
        routeObstacles.push({
          center: lerpPoint(oa, ob, 0.5),
          radius: PLAYER_MIN_CLEARANCE_PX,
        });
      });
      const route = computeDefensiveRoute(defA[id], defB[id], routeObstacles);
      if (route.waypoints.length > 2) {
        const routed = sampleRoute(route, localT);
        defPos[id].x = routed.x;
        defPos[id].y = routed.y;
      }
    });
  }

  // 5.b — Rate limiter sur défenseurs : si `options.prevFrame` est fourni
  // (= playback en cours), on clamp le saut max par défenseur à
  // MAX_DEFENDER_JUMP_PX. Évite les snaps visuels mid-segment causés par
  // changements brutaux d'état d'écran / Bezier flips / adhesion blend
  // discontinue. La position rattrape progressivement sur les frames
  // suivantes (~5 frames = 80ms pour 90 px → imperceptible).
  if (options.prevFrame) {
    const prev = options.prevFrame.defPos;
    defenderIds.forEach((id) => {
      const p = prev[id];
      const c = defPos[id];
      if (!p || !c) return;
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > MAX_DEFENDER_JUMP_PX) {
        const k = MAX_DEFENDER_JUMP_PX / d;
        defPos[id].x = p.x + dx * k;
        defPos[id].y = p.y + dy * k;
      }
    });
  }
  resolveInterpolatedFrameCollisions({
    off,
    defPos,
    attackerIds,
    defenderIds,
    attackerIsScreening,
    forcedScreeners: new Set([a.forcedScreener, b.forcedScreener].filter(Boolean) as AttackerId[]),
    lockedDefenders: screenLockedDefenders,
    prevFrame: options.prevFrame,
  });
  if (options.prevFrame) {
    clampPostCollisionFrameJumps({
      off,
      defPos,
      attackerIds,
      defenderIds,
      attackerIsScreening,
      prevFrame: options.prevFrame,
    });
  }
  if (options.prevFrame && decisions) {
    const prev = options.prevFrame.defPos;
    defenderIds.forEach((id) => {
      const p = prev[id];
      const c = defPos[id];
      if (!p || !c || !decisions[id]) return;
      decisions[id]!.lastJumpPx = Math.hypot(c.x - p.x, c.y - p.y);
    });
  }
  const nextMotionMemory = options.prevFrame
    ? buildDefenderMotionMemory(defPos, options.prevFrame, defenderIds, motionResult?.stats)
    : undefined;
  recomputeDefenseFrameOrientations(state, off, carrier, defPos);
  profiler?.lap('rateLimiter');

  // ---------------------------------------------------------------------
  // 6. Ballon — suit la position INTERPOLÉE du porteur (et non les positions
  //    brutes des steps). Sans ça, un dribble avec waypoints fait suivre la
  //    courbe au joueur mais le ballon allait en ligne droite, donnant
  //    l'impression que la balle quitte la main du porteur.
  //    Pour les passes (carrierChanged), on prend les positions interpolées
  //    des deux porteurs (passeur et receveur) — la parabole est correcte.
  // ---------------------------------------------------------------------
  // D.3 — Récupère le type de passe pour moduler la parabole. On cherche
  // une annotation 'pass' sur le step destination (b) qui matche le couple
  // carrierA → carrierB. Si trouvée et passKind défini, on l'utilise.
  let passKind: 'direct' | 'lob' | 'bounce' | 'skip' | undefined;
  let passLocalT = localT;
  let passIsActive = carrierA !== carrierB;
  if (carrierA !== carrierB) {
    const passAnn = b.annotations.find(
      (a) => a.type === 'pass' && a.fromId === carrierA && a.toId === carrierB
    );
    passKind = passAnn?.passKind;
    if (passAnn) {
      const timing = resolveAnnotationTiming(passAnn, getStepDurationSeconds(state, idxA));
      const tStart = timing.tStart;
      const tEnd = Math.max(tStart + 0.001, timing.tEnd);
      if (localT <= tStart) {
        passLocalT = 0;
        passIsActive = false;
      } else if (localT >= tEnd) {
        passLocalT = 1;
        passIsActive = false;
      } else {
        passLocalT = (localT - tStart) / (tEnd - tStart);
        passIsActive = true;
      }
    }
  }
  const ball = computeBallFrame(
    passLocalT >= 1 ? (off[carrierB] ?? offB[carrierB]) : (off[carrierA] ?? offA[carrierA]),
    passLocalT <= 0 ? (off[carrierA] ?? offA[carrierA]) : (off[carrierB] ?? offB[carrierB]),
    passIsActive,
    passLocalT,
    passKind
  );
  profiler?.lap('ball');
  const profile = profiler?.finish();

  return {
    off,
    defPos,
    carrier,
    screen,
    offBallScreens,
    stepIdx: options.stepIdx ?? idxA,
    ballPos: ball.pos,
    ballInFlight: ball.inFlight,
    attVisuals: computeAttackerVisuals(state, idxB),
    attackerIsScreening,
    attackerMovementType,
    screenMemory: Object.keys(nextScreenMemory).length > 0 ? nextScreenMemory : undefined,
    motionMemory: nextMotionMemory,
    debug: decisions ? { idxA, idxB, localT, defenders: decisions } : undefined,
    profile,
  };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function createFrameProfiler() {
  const phases: Record<FrameProfilePhase, number> = {
    attackers: 0,
    screens: 0,
    obstacles: 0,
    defenders: 0,
    collisions: 0,
    rateLimiter: 0,
    ball: 0,
  };
  const start = nowMs();
  let last = start;
  return {
    lap(phase: FrameProfilePhase) {
      const now = nowMs();
      phases[phase] += now - last;
      last = now;
    },
    finish(): FrameProfile {
      return {
        totalMs: nowMs() - start,
        phases,
      };
    },
  };
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clusterPositionLabel(cluster: { center: Point }): string {
  return `(${Math.round(cluster.center.x)},${Math.round(cluster.center.y)})`;
}

function matchClusterToScreenObstacle(
  cluster: { center: Point },
  candidates: readonly ScreenObstacle[]
): DefenderId | undefined {
  const m = candidates.find((c) =>
    Math.abs(c.center.x - cluster.center.x) < 0.01 &&
    Math.abs(c.center.y - cluster.center.y) < 0.01
  );
  return m?.defenderToSkip;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function resolveInterpolatedFrameCollisions(params: {
  off: AttackerPositions;
  defPos: ComputedDefense;
  attackerIds: AttackerId[];
  defenderIds: DefenderId[];
  attackerIsScreening: Partial<Record<AttackerId, boolean>>;
  forcedScreeners: ReadonlySet<AttackerId>;
  lockedDefenders: ReadonlySet<DefenderId>;
  prevFrame?: PlaybackFrame;
}): void {
  const entities = [
    ...params.attackerIds.map((id) => ({
      id: `O:${id}` as const,
      point: params.off[id],
      fixed: !!params.attackerIsScreening[id] || params.forcedScreeners.has(id),
      fallbackDirection: frameCollisionFallback(
        params.prevFrame?.off[id],
        params.off[id],
        id.charCodeAt(1)
      ),
    })),
    ...params.defenderIds.map((id) => ({
      id: `D:${id}` as const,
      point: params.defPos[id],
      fixed: params.lockedDefenders.has(id),
      fallbackDirection: frameCollisionFallback(
        params.prevFrame?.defPos[id],
        params.defPos[id],
        id.charCodeAt(1) + 5
      ),
    })),
  ];

  const solved = solveEntityCollisions({
    entities,
    defaultMinDist: INTERPOLATED_FRAME_CLEARANCE_PX,
    iterations: 4,
    epsilon: 0.25,
  });

  params.attackerIds.forEach((id) => {
    const p = solved.positions[`O:${id}`];
    if (!p) return;
    params.off[id] = p;
  });
  params.defenderIds.forEach((id) => {
    const p = solved.positions[`D:${id}`];
    if (!p) return;
    params.defPos[id].x = p.x;
    params.defPos[id].y = p.y;
  });
}

function clampPostCollisionFrameJumps(params: {
  off: AttackerPositions;
  defPos: ComputedDefense;
  attackerIds: AttackerId[];
  defenderIds: DefenderId[];
  attackerIsScreening: Partial<Record<AttackerId, boolean>>;
  prevFrame: PlaybackFrame;
}): void {
  params.attackerIds.forEach((id) => {
    if (params.attackerIsScreening[id]) return;
    const prev = params.prevFrame.off[id];
    const current = params.off[id];
    if (!prev || !current) return;
    const clamped = clampStepDelta(prev, current, MAX_ATTACKER_JUMP_PX);
    params.off[id] = clamped;
  });
  params.defenderIds.forEach((id) => {
    const prev = params.prevFrame.defPos[id];
    const current = params.defPos[id];
    if (!prev || !current) return;
    const clamped = clampStepDelta(prev, current, MAX_DEFENDER_JUMP_PX);
    params.defPos[id].x = clamped.x;
    params.defPos[id].y = clamped.y;
  });
}

function clampStepDelta(prev: Point, current: Point, maxDelta: number): Point {
  const dx = current.x - prev.x;
  const dy = current.y - prev.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDelta) return current;
  const k = maxDelta / d;
  return { x: prev.x + dx * k, y: prev.y + dy * k };
}

function frameCollisionFallback(prev: Point | undefined, current: Point, seed: number): Point {
  if (prev) {
    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) return { x: dx / len, y: dy / len };
  }
  const angle = seed * 2.399963229728653;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

interface DefenderMotionStat {
  turnDeg: number;
  inertia: number;
}

interface DefenderMotionInertiaResult {
  stats: Partial<Record<DefenderId, DefenderMotionStat>>;
  applied: boolean;
}

function applyDefenderMotionInertia(params: {
  state: AppState;
  idxA: number;
  idxB: number;
  defPos: ComputedDefense;
  prevFrame: PlaybackFrame;
  defenderIds: DefenderId[];
  lockedDefenders: ReadonlySet<DefenderId>;
  decisions: Partial<Record<DefenderId, FrameDecision>> | null;
}): DefenderMotionInertiaResult {
  const stats: Partial<Record<DefenderId, DefenderMotionStat>> = {};
  let applied = false;
  params.defenderIds.forEach((id) => {
    const prev = params.prevFrame.defPos[id];
    const current = params.defPos[id];
    if (!prev || !current) return;

    const previousVelocity = params.prevFrame.motionMemory?.[id]?.velocity;
    if (!previousVelocity) return;

    const desired = { x: current.x - prev.x, y: current.y - prev.y };
    const desiredDist = Math.hypot(desired.x, desired.y);
    const previousSpeed = Math.hypot(previousVelocity.x, previousVelocity.y);
    if (desiredDist < DEFENDER_INERTIA_MIN_SPEED_PX || previousSpeed < DEFENDER_INERTIA_MIN_SPEED_PX) {
      return;
    }

    const cos = clampScalar(
      (desired.x * previousVelocity.x + desired.y * previousVelocity.y) /
        (desiredDist * previousSpeed),
      -1,
      1
    );
    const turnDeg = Math.acos(cos) * 180 / Math.PI;
    let inertia = 0;

    if (!shouldSkipDefenderMotionInertia(params.state, params.idxA, params.idxB, id, current, params.lockedDefenders)) {
      const mobility = defenderPlaybackMobility(params.state, id);
      inertia = clampScalar(
        (mobility.turnStartCos - cos) / (mobility.turnStartCos + 1),
        0,
        1
      ) * mobility.maxBlend;

      if (inertia > 0.001) {
        const desiredUnit = { x: desired.x / desiredDist, y: desired.y / desiredDist };
        const previousUnit = {
          x: previousVelocity.x / previousSpeed,
          y: previousVelocity.y / previousSpeed,
        };
        const mixed = normalizeVector({
          x: desiredUnit.x * (1 - inertia) + previousUnit.x * inertia,
          y: desiredUnit.y * (1 - inertia) + previousUnit.y * inertia,
        });
        const adjustedDist = desiredDist * (1 - inertia * mobility.speedLoss);
        current.x = prev.x + mixed.x * adjustedDist;
        current.y = prev.y + mixed.y * adjustedDist;
        applied = true;
      }
    }

    stats[id] = { turnDeg, inertia };
    const decision = params.decisions?.[id];
    if (decision) {
      decision.motionTurnDeg = turnDeg;
      decision.motionInertia = inertia;
    }
  });
  return { stats, applied };
}

function defenderPlaybackMobility(state: AppState, id: DefenderId): {
  turnStartCos: number;
  maxBlend: number;
  speedLoss: number;
} {
  const speed = state.rules[id]?.maxSpeed ?? state.defenseMaxSpeed;
  const speed01 = clampScalar((speed - 75) / (145 - 75), 0, 1);
  return {
    turnStartCos: lerpScalar(DEFENDER_INERTIA_SLOW_TURN_START_COS, DEFENDER_INERTIA_FAST_TURN_START_COS, speed01),
    maxBlend: lerpScalar(DEFENDER_INERTIA_SLOW_MAX_BLEND, DEFENDER_INERTIA_FAST_MAX_BLEND, speed01),
    speedLoss: lerpScalar(DEFENDER_INERTIA_SLOW_SPEED_LOSS, DEFENDER_INERTIA_FAST_SPEED_LOSS, speed01),
  };
}

function buildDefenderMotionMemory(
  defPos: ComputedDefense,
  prevFrame: PlaybackFrame,
  defenderIds: DefenderId[],
  stats: Partial<Record<DefenderId, DefenderMotionStat>> | undefined
): DefenderMotionMemory {
  const out: DefenderMotionMemory = {};
  defenderIds.forEach((id) => {
    const prev = prevFrame.defPos[id];
    const current = defPos[id];
    if (!prev || !current) return;
    const stat = stats?.[id];
    out[id] = {
      velocity: { x: current.x - prev.x, y: current.y - prev.y },
      turnDeg: stat?.turnDeg ?? 0,
      inertia: stat?.inertia ?? 0,
    };
  });
  return out;
}

function shouldSkipDefenderMotionInertia(
  state: AppState,
  idxA: number,
  idxB: number,
  id: DefenderId,
  current: ComputedDefense[DefenderId],
  lockedDefenders: ReadonlySet<DefenderId>
): boolean {
  if (lockedDefenders.has(id)) return true;
  if (current.onScreen || current.screenPhase === 'impact' || current.screenPhase === 'stuck') {
    return true;
  }
  return !!state.steps[idxA]?.defenseOverrides?.[id] || !!state.steps[idxB]?.defenseOverrides?.[id];
}

function normalizeVector(p: Point): Point {
  const len = Math.hypot(p.x, p.y);
  if (len < 0.000001) return { x: 1, y: 0 };
  return { x: p.x / len, y: p.y / len };
}

function clampScalar(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function plainDefPositions(def: ComputedDefense): Record<DefenderId, Point> {
  const out = {} as Record<DefenderId, Point>;
  (Object.entries(def) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(([id, p]) => {
    out[id] = { x: p.x, y: p.y };
  });
  return out;
}

function getSegmentScreenStatic(params: {
  state: AppState;
  idxA: number;
  idxB: number;
  offA: AttackerPositions;
  offB: AttackerPositions;
  defA: ComputedDefense;
  defB: ComputedDefense;
  carrierA: AttackerId;
  carrierB: AttackerId;
  stepA: Step;
  stepB: Step;
  disableCache: boolean;
}): SegmentScreenStatic {
  if (params.disableCache) return computeSegmentScreenStatic(params);

  const key = `${params.idxA}->${params.idxB}`;
  const deps = segmentScreenDepsKey(params);
  let stateCache = segmentScreenCache.get(params.state);
  if (!stateCache) {
    stateCache = new Map();
    segmentScreenCache.set(params.state, stateCache);
  }
  const cached = stateCache.get(key);
  if (cached?.deps === deps) return cached.value;

  const value = computeSegmentScreenStatic(params);
  stateCache.set(key, { deps, value });
  return value;
}

function computeSegmentScreenStatic(params: {
  state: AppState;
  idxA: number;
  idxB: number;
  offA: AttackerPositions;
  offB: AttackerPositions;
  defA: ComputedDefense;
  defB: ComputedDefense;
  carrierA: AttackerId;
  carrierB: AttackerId;
  stepA: Step;
  stepB: Step;
}): SegmentScreenStatic {
  const matchupsA = getMatchupsAt(
    params.state.steps,
    Math.max(0, params.idxA - 1),
    params.state.playerCount
  );
  const matchupsB = getMatchupsAt(
    params.state.steps,
    Math.max(0, params.idxB - 1),
    params.state.playerCount
  );
  const defPlainA = plainDefPositions(params.defA);
  const defPlainB = plainDefPositions(params.defB);
  const ctxA = detectScreenContext({
    off: params.offA,
    carrier: params.carrierA,
    matchups: matchupsA,
    defenderPositions: defPlainA,
    screenRadius: params.state.screenRadius,
    forcedScreener: params.stepA.forcedScreener,
  });
  const ctxB = detectScreenContext({
    off: params.offB,
    carrier: params.carrierB,
    matchups: matchupsB,
    defenderPositions: defPlainB,
    screenRadius: params.state.screenRadius,
    forcedScreener: params.stepB.forcedScreener,
  });
  const exitRadius = screenContactExitRadius(params.state.screenRadius);
  const ctxAExit = detectScreenContext({
    off: params.offA,
    carrier: params.carrierA,
    matchups: matchupsA,
    defenderPositions: defPlainA,
    screenRadius: exitRadius,
    forcedScreener: params.stepA.forcedScreener,
  });
  const ctxBExit = detectScreenContext({
    off: params.offB,
    carrier: params.carrierB,
    matchups: matchupsB,
    defenderPositions: defPlainB,
    screenRadius: exitRadius,
    forcedScreener: params.stepB.forcedScreener,
  });

  return {
    matchupsA,
    matchupsB,
    ctxA,
    ctxB,
    ctxAExit,
    ctxBExit,
    screenerObstacles: buildSegmentScreenObstacles(
      ctxA,
      ctxB,
      params.offA,
      params.offB,
      params.defA,
      params.defB
    ),
  };
}

function segmentScreenDepsKey(params: {
  state: AppState;
  idxA: number;
  idxB: number;
  offA: AttackerPositions;
  offB: AttackerPositions;
  defA: ComputedDefense;
  defB: ComputedDefense;
  stepA: Step;
  stepB: Step;
}): string {
  return [
    `players=${params.state.playerCount}`,
    `system=${params.state.defenseSystem}`,
    `radius=${params.state.screenRadius}`,
    `screenRule=${params.state.screenRule}`,
    `offBallRule=${params.state.offBallScreenRule}`,
    `matchups=${matchupsDepsKey(params.state.steps, Math.max(params.idxA, params.idxB) - 1)}`,
    `stepA=${stepScreenDepsKey(params.stepA)}`,
    `stepB=${stepScreenDepsKey(params.stepB)}`,
    `offA=${pointRecordKey(params.offA)}`,
    `offB=${pointRecordKey(params.offB)}`,
    `defA=${pointRecordKey(params.defA)}`,
    `defB=${pointRecordKey(params.defB)}`,
  ].join('|');
}

function matchupsDepsKey(steps: Step[], throughIdx: number): string {
  if (throughIdx < 0) return '';
  const parts: string[] = [];
  for (let i = 0; i <= throughIdx && i < steps.length; i++) {
    const step = steps[i];
    parts.push(`${i}:${stableJson(step.switches ?? [])}:${stableJson(step.assignmentOverrides ?? {})}`);
  }
  return parts.join(';');
}

function stepScreenDepsKey(step: Step): string {
  return stableJson({
    ballCarrier: step.ballCarrier,
    forcedScreener: step.forcedScreener,
    annotations: step.annotations,
  });
}

function pointRecordKey(record: Record<string, Point>): string {
  return Object.keys(record)
    .sort()
    .map((id) => {
      const p = record[id];
      return `${id}:${roundCoord(p.x)},${roundCoord(p.y)}`;
    })
    .join(';');
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
    return Object.keys(val)
      .sort()
      .reduce((out, key) => {
        (out as Record<string, unknown>)[key] = (val as Record<string, unknown>)[key];
        return out;
      }, {} as Record<string, unknown>);
  });
}

function roundCoord(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

function smoothstep(edge0: number, edge1: number, t: number): number {
  if (edge1 <= edge0) return t >= edge1 ? 1 : 0;
  const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function radialContactPoint(point: Point, screener: Point): Point {
  const away = { x: point.x - screener.x, y: point.y - screener.y };
  let len = Math.hypot(away.x, away.y);
  if (len < 0.01) {
    away.x = 1;
    away.y = 0;
    len = 1;
  }
  const clearance = PLAYER_MIN_CLEARANCE_PX + 1;
  return {
    x: screener.x + (away.x / len) * clearance,
    y: screener.y + (away.y / len) * clearance,
  };
}

interface OffBallAdvancedContactGeometry {
  kind: 'stagger' | 'elevator';
  contactPoint: Point;
  releaseAnchor: Point;
  axis: Point;
  normal: Point;
  sideSign: number;
  progress: number;
  screeners: AttackerId[];
  activeScreener: AttackerId | undefined;
}

function offBallAdvancedContactGeometry(
  screen: DetectedOffBallScreen | undefined,
  off: AttackerPositions,
  anchor: Point,
  localT: number
): OffBallAdvancedContactGeometry | null {
  if (!screen || (screen.type !== 'stagger' && screen.type !== 'elevator')) {
    return null;
  }
  const contacts = offBallScreeners(screen);
  const firstContact = contacts[0];
  const secondContact = contacts[1];
  if (!firstContact || !secondContact) return null;

  const first = off[firstContact.screener] ?? firstContact.screenerPos;
  const second = off[secondContact.screener] ?? secondContact.screenerPos;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;

  const axis = { x: dx / len, y: dy / len };
  const normal = { x: -axis.y, y: axis.x };
  const screeners = contacts.map((c) => c.screener);

  if (screen.type === 'elevator') {
    const gapCenter = midpoint(first, second);
    const progress = smoothstep(0.18, 0.86, localT);
    const anchorSide = (anchor.x - gapCenter.x) * normal.x + (anchor.y - gapCenter.y) * normal.y;
    const sideSign = anchorSide >= 0 ? 1 : -1;
    const corridorDepth = Math.max(
      PLAYER_MIN_CLEARANCE_PX * 0.35,
      Math.min(PLAYER_MIN_CLEARANCE_PX * 0.75, len * 0.45)
    );
    return {
      kind: 'elevator',
      contactPoint: {
        x: gapCenter.x + normal.x * sideSign * corridorDepth * (1 - progress * 2),
        y: gapCenter.y + normal.y * sideSign * corridorDepth * (1 - progress * 2),
      },
      releaseAnchor: gapCenter,
      axis,
      normal,
      sideSign,
      progress,
      screeners,
      activeScreener: progress < 0.5 ? firstContact.screener : secondContact.screener,
    };
  }

  const progress = smoothstep(0.34, 0.72, localT);
  const center = {
    x: first.x + dx * progress,
    y: first.y + dy * progress,
  };
  const anchorSide = (anchor.x - center.x) * normal.x + (anchor.y - center.y) * normal.y;
  const sign = anchorSide >= 0 ? 1 : -1;
  const clearance = PLAYER_MIN_CLEARANCE_PX + 1;
  const activeIndex = progress < 0.5 ? 0 : 1;
  const releaseAnchor = activeIndex === 0 ? first : second;
  return {
    kind: 'stagger',
    contactPoint: {
      x: center.x + normal.x * sign * clearance,
      y: center.y + normal.y * sign * clearance,
    },
    releaseAnchor,
    axis,
    normal,
    sideSign: sign,
    progress,
    screeners,
    activeScreener: activeIndex === 0 ? firstContact.screener : secondContact.screener,
  };
}

function stabilizeContactPointFromMemory(current: Point, previous: Point, screener: Point): Point {
  const cx = current.x - screener.x;
  const cy = current.y - screener.y;
  const px = previous.x - screener.x;
  const py = previous.y - screener.y;
  const currentLen = Math.hypot(cx, cy);
  const previousLen = Math.hypot(px, py);
  if (currentLen < 0.01 || previousLen < 0.01) return current;
  const dot = (cx / currentLen) * (px / previousLen) + (cy / currentLen) * (py / previousLen);
  if (dot >= 0.2) return current;
  return {
    x: screener.x + (px / previousLen) * currentLen,
    y: screener.y + (py / previousLen) * currentLen,
  };
}

function tangentReleasePoint(
  contactPoint: Point,
  screener: Point,
  target: Point,
  progress: number,
  quality: number
): Point {
  const radial = { x: contactPoint.x - screener.x, y: contactPoint.y - screener.y };
  let radialLen = Math.hypot(radial.x, radial.y);
  if (radialLen < 0.01) {
    radial.x = 1;
    radial.y = 0;
    radialLen = 1;
  }

  const ux = radial.x / radialLen;
  const uy = radial.y / radialLen;
  const tangent = { x: -uy, y: ux };
  const toTarget = { x: target.x - contactPoint.x, y: target.y - contactPoint.y };
  const sign = tangent.x * toTarget.x + tangent.y * toTarget.y >= 0 ? 1 : -1;
  const q = Math.max(0, Math.min(100, quality)) / 100;
  const t = Math.max(0, Math.min(1, progress));
  const tangentDist = PLAYER_MIN_CLEARANCE_PX * (0.35 + q * 0.35);
  const outwardDist = PLAYER_MIN_CLEARANCE_PX * 0.10;

  return {
    x: contactPoint.x + tangent.x * sign * tangentDist * t + ux * outwardDist * t,
    y: contactPoint.y + tangent.y * sign * tangentDist * t + uy * outwardDist * t,
  };
}

function offBallAdvancedReleasePoint(
  contact: OffBallAdvancedContactGeometry,
  contactPoint: Point,
  target: Point,
  progress: number,
  quality: number
): Point {
  if (contact.kind !== 'elevator') {
    return tangentReleasePoint(contactPoint, contact.releaseAnchor, target, progress, quality);
  }

  const toTarget = { x: target.x - contactPoint.x, y: target.y - contactPoint.y };
  const normalSign = contact.normal.x * toTarget.x + contact.normal.y * toTarget.y >= 0 ? 1 : -1;
  const axisSign = contact.axis.x * toTarget.x + contact.axis.y * toTarget.y >= 0 ? 1 : -1;
  const q = Math.max(0, Math.min(100, quality)) / 100;
  const t = Math.max(0, Math.min(1, progress));
  const throughGateDist = PLAYER_MIN_CLEARANCE_PX * (0.45 + q * 0.45);
  const laneDist = PLAYER_MIN_CLEARANCE_PX * (0.08 + q * 0.12);

  return {
    x: contactPoint.x +
      contact.normal.x * normalSign * throughGateDist * t +
      contact.axis.x * axisSign * laneDist * t,
    y: contactPoint.y +
      contact.normal.y * normalSign * throughGateDist * t +
      contact.axis.y * axisSign * laneDist * t,
  };
}
