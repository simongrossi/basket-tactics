// Calcule la PlaybackFrame courante de CourtView :
//
//  - `staticFrame` (mémoïsée sur state)         → frame de l'étape active
//  - `scrubFrame`  (mémoïsée sur scrubT)        → interpolation timeline drag
//  - `playFrame`   (state, posé par handleTick) → frame de la lecture continue
//
// La frame effective = playFrame ?? scrubFrame ?? staticFrame.
//
// On en dérive `threatData` (anneaux de menace) si `state.showThreats`.
//
// Câble aussi `usePlaybackAnimation` et expose son tick au caller via
// `onPlaybackTick` (pour mettre à jour le slider parent).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedAttackerVisuals,
  ComputedDefense,
  DefenderId,
  DetectedOffBallScreen,
  Point,
  Matchups,
} from '@/lib/types';
import type { ManualGestureFrame } from '@/lib/state/manualGestures';
import type { DefenseReleaseTransition, DefenderPursuit } from '@/hooks/useAppState';
import type { MatchState } from '@/lib/logic/match/gameLoop';
import {
  getDefenseHoop,
  computeAttackerVisuals,
  effectiveDefensePositions,
  getMatchupsAt,
  recomputeDefenseFrameOrientations,
} from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import { buildStep0DetectionPositions } from '@/lib/logic/step0Detection';
import {
  resolveTimelineFrame,
  type PlaybackFrame,
} from '@/lib/logic/playback/frameResolver';
import { computeAttackerThreats } from '@/lib/logic/threats';
import { resolveRealismFlags } from '@/lib/logic/realismProfile';
import { getStepDurationSeconds } from '@/lib/logic/timecode';
import { usePlaybackAnimation } from '@/hooks/usePlaybackAnimation';
import { computeAttackerOrientation, computeDefenderOrientation } from '@/lib/logic/orientation';
import { hasShotOutcome } from '@/lib/logic/shotTracking';

export interface DisplayedCourtFrame {
  state: AppState;
  frame: PlaybackFrame;
  dynamic: boolean;
}

interface UseCourtFrameOptions {
  onFrameChange?: (snapshot: DisplayedCourtFrame) => void;
  state: AppState;
  /** Replay de gestes : les coordonnées et angles enregistrés priment sur
   *  toutes les sources calculées, sans repasser par le moteur défensif. */
  recordedFrame?: ManualGestureFrame | null;
  isPlaying: boolean;
  playbackSpeed: number;
  playbackStartT: number;
  playbackRunId?: number;
  scrubT: number | null | undefined;
  /** E.2 — Instant d'export (espace step). Quand défini, prime sur scrub
   *  et playback : c'est la frame que l'utilisateur capture. */
  exportT?: number | null;
  onPlaybackTick?: (t: number) => void;
  onPlaybackEnd?: () => void;
  /** Animation transitoire "Tout en auto réel". Hors playback/scrub, les
   *  positions défenseurs sont lerp depuis `fromPositions` vers les positions
   *  auto recomputées par l'engine, sur `durationMs`. */
  defenseReleaseTransition?: DefenseReleaseTransition | null;
  /** V1+V2+V3 — Poursuite défenseur pendant drag attaquant. Pilote un rAF
   *  loop qui maintient les positions défenseurs avec un cap de vitesse
   *  modulé (footwork, fatigue). */
  defenderPursuit?: DefenderPursuit | null;
  onDefenderPursuitSettled?: (finished: DefenderPursuit) => void;
  /** B4 — état de la game loop "▶ Play IA (live)". Quand non-null, le
   *  rendu utilise les positions live au lieu du staticFrame. Priorité
   *  maximale dans la frame chain. */
  liveMatchState?: MatchState | null;
}

export interface UseCourtFrameResult {
  frame: PlaybackFrame;
  threatData: ReturnType<typeof computeAttackerThreats> | null;
}

function extractDefPositions(defPos: ComputedDefense): Record<DefenderId, Point> {
  const out = {} as Record<DefenderId, Point>;
  (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(([id, p]) => {
    out[id] = { x: p.x, y: p.y };
  });
  return out;
}

function frameFromRecording(state: AppState, saved: ManualGestureFrame): PlaybackFrame {
  const off = Object.fromEntries(Object.entries(saved.off).map(([id, pos]) => [id, { ...pos }])) as AttackerPositions;
  const ballPos = { ...saved.ball };
  const defPos = {} as ComputedDefense;
  const matchups = {} as Matchups;
  const hoop = getDefenseHoop(state);
  for (const [id, pos] of Object.entries(saved.def) as [DefenderId, NonNullable<ManualGestureFrame['def'][DefenderId]>][]) {
    const rule = state.rules[id];
    const visual = computeDefenderOrientation({
      defenderPos: pos,
      manPos: off[pos.matchedTo] ?? ballPos,
      ballPos,
      isCarrierDefender: pos.matchedTo === saved.carrier,
      stance: state.defenseSystem === 'zone' ? 'sag' : rule?.offBallStance,
      vsCarrier: rule?.vsCarrier,
      manualBody: pos.orientation,
      hoop,
    });
    const gazeRadians = pos.gazeOrientation * Math.PI / 180;
    matchups[id] = pos.matchedTo;
    defPos[id] = {
      ...pos,
      // Aucun moteur de mouvement, collision ou vitesse ne doit modifier
      // ces positions. Les seuls éléments dérivés sont les bras et le regard.
      facing: { x: pos.x + Math.sin(gazeRadians) * 30, y: pos.y - Math.cos(gazeRadians) * 30 },
      armBallSide: visual.armBallSide,
      armManSide: visual.armManSide,
      late: false,
      helpFactor: 0,
      isCarrierDefender: pos.matchedTo === saved.carrier,
      onScreen: false,
      switchedThisStep: false,
    };
  }
  const cur = state.steps[state.activeStep];
  const screen = state.defenseSystem === 'man'
    ? detectScreen(off, saved.carrier, matchups, defPos, state.screenRadius, cur?.forcedScreener)
    : null;
  const offBallScreens = state.defenseSystem === 'man'
    ? detectOffBallScreens(off, saved.carrier, matchups, defPos, state.screenRadius)
    : [];
  const screenTargets = new Map<AttackerId, Point>();
  if (screen) screenTargets.set(screen.screener, defPos[screen.carrierDef]);
  for (const detected of offBallScreens) screenTargets.set(detected.screener, defPos[detected.cutterDef]);
  const attVisuals = {} as ComputedAttackerVisuals;
  const attackerIsScreening: Partial<Record<AttackerId, boolean>> = {};
  for (const [id, pos] of Object.entries(off) as [AttackerId, Point][]) {
    const screenTargetDefPos = screenTargets.get(id);
    const role = id === saved.carrier ? (hasShotOutcome(cur) ? 'shooter' : 'carrier') : screenTargetDefPos ? 'screener' : 'idle';
    const visual = computeAttackerOrientation({
      attackerPos: pos,
      role,
      ballPos,
      hoop,
      screenTargetDefPos,
      manualBody: state.attackerOrientations?.[id]?.body,
      manualGaze: state.attackerOrientations?.[id]?.gaze,
    });
    attVisuals[id] = {
      orientation: visual.bodyOrientation,
      gazeOrientation: visual.gazeOrientation,
      facing: visual.facing,
      armBallSide: visual.armBallSide,
      armManSide: visual.armManSide,
    };
    if (screenTargetDefPos) attackerIsScreening[id] = true;
  }
  return {
    off, defPos, carrier: saved.carrier, ballPos, ballInFlight: false,
    stepIdx: state.activeStep, screen, offBallScreens, attVisuals,
    attackerIsScreening, attackerMovementType: {},
  };
}

export function useCourtFrame(opts: UseCourtFrameOptions): UseCourtFrameResult {
  const { state, recordedFrame, isPlaying, playbackSpeed, playbackStartT, scrubT, exportT, onPlaybackTick, onPlaybackEnd, defenseReleaseTransition, defenderPursuit, liveMatchState } = opts;
  const replaying = recordedFrame != null;
  const recordedPlaybackFrame = useMemo(
    () => recordedFrame ? frameFromRecording(state, recordedFrame) : null,
    [state, recordedFrame]
  );

  const [playFrame, setPlayFrame] = useState<PlaybackFrame | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onPursuitSettledRef = useRef(opts.onDefenderPursuitSettled);
  onPursuitSettledRef.current = opts.onDefenderPursuitSettled;
  const handleTick = useCallback((t: number) => {
    const cur = stateRef.current;
    const totalSteps = cur.steps.length - 1;
    if (totalSteps <= 0) return;
    onPlaybackTick?.(t);
    const frame = resolveTimelineFrame(cur, t, {
      collectDecisions: !!cur.showScreenDebug || !!cur.showPlayerDebug,
      profile: !!cur.showProfileOverlay,
    });
    if (frame) {
      setPlayFrame(frame);
    }
    // onPlaybackTick volontairement hors deps : on lit stateRef, et changer
    // d'identité de callback ne doit pas re-créer la boucle d'animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePlaybackAnimation({
    state,
    isPlaying: isPlaying && !replaying,
    speed: playbackSpeed,
    totalSteps: state.steps.length - 1,
    startT: playbackStartT,
    runId: opts.playbackRunId,
    onTick: handleTick,
    onEnd: onPlaybackEnd,
    realSpeedMode: state.realSpeedMode,
  });

  // Reset du playFrame quand la lecture s'arrête (pause / fin externe).
  useEffect(() => {
    if (!isPlaying) {
      setPlayFrame(null);
    }
  }, [isPlaying]);

  // Frame statique (étape active, sans interpolation).
  const staticFrame = useMemo<PlaybackFrame>(() => {
    if (recordedPlaybackFrame) return recordedPlaybackFrame;
    const cur = state.steps[state.activeStep];
    const off = activeOffense(cur.off, state.playerCount);
    const carrier = activeBallCarrier(cur, state.playerCount);
    const defPos = effectiveDefensePositions(state, state.activeStep);
    let screen: ReturnType<typeof detectScreen> = null;
    let offBallScreens: DetectedOffBallScreen[] = [];
    if (state.defenseSystem === 'man') {
      const matchups = getMatchupsAt(state.steps, state.activeStep - 1, state.playerCount);
      const defPosExtracted = extractDefPositions(defPos);
      // À step 0 : les défenseurs peuvent être "late" (bloqués loin de leur
      // cible à cause d'un écran). On détecte l'écran à partir des cibles
      // idéales pour que l'indicateur reste visible même si D1 n'a pas
      // physiquement atteint le poseur.
      const detectionPos = state.activeStep === 0
        ? buildStep0DetectionPositions(state, off, carrier, matchups, defPosExtracted)
        : defPosExtracted;
      screen = detectScreen(off, carrier, matchups, detectionPos, state.screenRadius, cur.forcedScreener);
      offBallScreens = detectOffBallScreens(off, carrier, matchups, detectionPos, state.screenRadius);
    }
    const carrierPos = off[carrier];
    const ballPos: Point = carrierPos
      ? { x: carrierPos.x + 16, y: carrierPos.y - 16 }
      : { x: 0, y: 0 };
    return {
      off,
      defPos,
      carrier,
      screen,
      offBallScreens,
      stepIdx: state.activeStep,
      ballPos,
      ballInFlight: false,
      attVisuals: computeAttackerVisuals(state, state.activeStep),
      attackerIsScreening: {},
      attackerMovementType: {},
    };
  }, [state, recordedPlaybackFrame]);

  // Scrub frame (interpolation entre étapes pendant le drag de la timeline).
  // Même logique que la lecture continue avec un stepIdx arrondi pour afficher
  // l'étape la plus proche du curseur.
  //
  // J.1 — Parité scrub ↔ playback : on aligne les options de diagnostic
  // (collectDecisions, profile) entre les deux appels pour que les overlays
  // J.5/J.7 marchent aussi en scrub. La parité positionnelle est garantie
  // par resolveTimelineFrame qui reconstruit la mémoire depuis
  // le début de la timeline (cf. SCREEN-ENGINE.md).
  const scrubFrame = useMemo<PlaybackFrame | null>(() => {
    if (replaying || scrubT == null) return null;
    const totalSteps = state.steps.length - 1;
    if (totalSteps <= 0) return null;
    const t = Math.max(0, Math.min(totalSteps, scrubT));
    return resolveTimelineFrame(state, t, {
      stepIdx: Math.round(t),
      collectDecisions: !!state.showScreenDebug || !!state.showPlayerDebug,
      profile: !!state.showProfileOverlay,
    });
  }, [scrubT, state, replaying]);

  // Tick d'animation pour le release "Tout en auto réel". Force un re-render
  // à 60 fps pendant la durée de la transition pour fluidifier le blend.
  // Hors transition active, aucun effet.
  const [releaseTick, setReleaseTick] = useState(0);
  useEffect(() => {
    if (replaying || !defenseReleaseTransition) return;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - defenseReleaseTransition.startedAtMs;
      if (elapsed >= defenseReleaseTransition.durationMs) return;
      setReleaseTick((t) => t + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [defenseReleaseTransition, replaying]);

  // Frame "release animée" : si une transition est active ET qu'on n'est ni
  // en playback ni en scrub, on blend les positions défenseurs depuis les
  // positions capturées (avant clear des overrides) vers la cible auto (post
  // clear, recomputée par staticFrame). Easing cubique pour démarrer vite et
  // ralentir à l'arrivée — visuellement "le défenseur revient se mettre en
  // place" plutôt qu'un téléport.
  const releaseFrame = useMemo<PlaybackFrame | null>(() => {
    if (replaying || !defenseReleaseTransition) return null;
    const elapsed = performance.now() - defenseReleaseTransition.startedAtMs;
    if (elapsed >= defenseReleaseTransition.durationMs) return null;
    const raw = elapsed / defenseReleaseTransition.durationMs;
    // ease-out cubique : f(t) = 1 - (1-t)³
    const eased = 1 - Math.pow(1 - raw, 3);
    const blended: ComputedDefense = { ...staticFrame.defPos };
    const prevDefPositions: Record<string, Point> = {};
    (Object.keys(blended) as DefenderId[]).forEach((id) => {
      const target = staticFrame.defPos[id];
      const from = defenseReleaseTransition.fromPositions[id];
      if (!from || !target) return;
      prevDefPositions[id] = { x: from.x, y: from.y };
      blended[id] = {
        ...target,
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      };
    });
    recomputeDefenseFrameOrientations(state, staticFrame.off, staticFrame.carrier, blended, prevDefPositions);
    return { ...staticFrame, defPos: blended };
    // releaseTick force l'invalidation à chaque rAF tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defenseReleaseTransition, staticFrame, releaseTick, replaying, state]);

  // === V1+V2+V3 — Poursuite défenseur pendant drag attaquant ===============
  // Maintient les positions défenseurs avec un cap de vitesse modulé (footwork,
  // fatigue en option). Après release, le rattrapage continue jusqu'à la
  // cible, sans reset vers le snapshot initial ni délai de téléportation.
  const livePositionsRef = useRef<Record<DefenderId, Point>>({} as Record<DefenderId, Point>);
  const prevLivePositionsRef = useRef<Record<DefenderId, Point>>({} as Record<DefenderId, Point>);
  const lastTickRef = useRef<number>(0);
  const lastAttackerPosRef = useRef<Record<string, Point>>({});
  const attackerLiveHeadingRef = useRef<Record<string, { dx: number; dy: number; updatedAtMs: number }>>({});
  const pivotLatencyRef = useRef<Record<DefenderId, number>>({} as Record<DefenderId, number>);
  const fatigueRef = useRef<Record<DefenderId, number>>({} as Record<DefenderId, number>);
  const pursuitSnapshotRef = useRef<DefenderPursuit['snapshot'] | null>(null);
  const pursuitSettledRef = useRef(false);
  const [pursuitTick, setPursuitTick] = useState(0);

  useEffect(() => {
    if (replaying || !defenderPursuit) {
      livePositionsRef.current = {} as Record<DefenderId, Point>;
      prevLivePositionsRef.current = {} as Record<DefenderId, Point>;
      lastAttackerPosRef.current = {};
      attackerLiveHeadingRef.current = {};
      pivotLatencyRef.current = {} as Record<DefenderId, number>;
      fatigueRef.current = {} as Record<DefenderId, number>;
      pursuitSnapshotRef.current = null;
      pursuitSettledRef.current = false;
      return;
    }
    // L'objet de poursuite change au relâchement, mais son snapshot reste
    // identique : ne jamais réinitialiser les positions dans ce cas.
    if (pursuitSnapshotRef.current !== defenderPursuit.snapshot) {
      pursuitSnapshotRef.current = defenderPursuit.snapshot;
      livePositionsRef.current = {} as Record<DefenderId, Point>;
      prevLivePositionsRef.current = {} as Record<DefenderId, Point>;
      for (const [id, p] of Object.entries(defenderPursuit.snapshot)) {
        if (p) {
          livePositionsRef.current[id as DefenderId] = { ...p };
          prevLivePositionsRef.current[id as DefenderId] = { ...p };
        }
      }
      lastAttackerPosRef.current = {};
      attackerLiveHeadingRef.current = {};
      const initOff = activeOffense(stateRef.current.steps[stateRef.current.activeStep].off, stateRef.current.playerCount);
      (Object.entries(initOff) as [string, Point][]).forEach(([aid, pos]) => {
        lastAttackerPosRef.current[aid] = { x: pos.x, y: pos.y };
      });
      pivotLatencyRef.current = {} as Record<DefenderId, number>;
      fatigueRef.current = {} as Record<DefenderId, number>;
      pursuitSettledRef.current = false;
    }
    lastTickRef.current = performance.now();

    let raf = 0;
    const tick = () => {
      const cur = stateRef.current;
      if (cur.activeStep !== defenderPursuit.stepIndex) return;
      const realism = resolveRealismFlags(cur);
      const advancedInertia = !!cur.defenderDragInertiaEnabled;
      const now = performance.now();
      // Un onglet suspendu ne doit pas rattraper plusieurs secondes d'un coup.
      const dt = Math.min(50, Math.max(0, now - lastTickRef.current));
      lastTickRef.current = now;
      // Step duration en ms (pour normaliser maxSpeed px/step → px/ms).
      // En édition interactive, si la durée de step n'est pas spécifiée,
      // on utilise la base physique de 2 s (PLAYBACK_STEP_DURATION_MS) plutôt
      // que la durée complète d'une possession tactique (4 s).
      const stepDurationSec = cur.secondsPerStep != null
        ? getStepDurationSeconds(cur, cur.activeStep)
        : (cur.realSpeedMode ? 0.5 : 2);
      const stepDurationMs = stepDurationSec * 1000;

      const target = effectiveDefensePositions(cur, cur.activeStep);
      const off = activeOffense(cur.steps[cur.activeStep].off, cur.playerCount);

      (Object.keys(target) as DefenderId[]).forEach((id) => {
        const live = livePositionsRef.current[id];
        if (!live) {
          livePositionsRef.current[id] = { x: target[id].x, y: target[id].y };
          prevLivePositionsRef.current[id] = { x: target[id].x, y: target[id].y };
          return;
        }
        prevLivePositionsRef.current[id] = { x: live.x, y: live.y };
        const t = target[id];
        const baseMaxPxPerMs = Math.max(0, cur.rules[id]?.maxSpeed ?? cur.defenseMaxSpeed)
          / Math.max(100, stepDurationMs);

        // V3 — profil athlétique : elite +30 %, lent −30 %.
        const speedProfile = cur.defenderSpeedProfiles?.[id];
        const profileMult =
          speedProfile === 'elite' ? 1.3 :
          speedProfile === 'lent' ? 0.7 : 1.0;

        // V2 — modulation footwork (si flag actif).
        let footworkMult = 1.0;
        const matchedAttId = target[id].matchedTo;
        const matchedAtt = matchedAttId ? off[matchedAttId] : null;
        const dx = t.x - live.x;
        const dy = t.y - live.y;
        const distToTarget = Math.hypot(dx, dy);

        if (advancedInertia && realism.footworkRulesEnabled && matchedAtt) {
          // Direction du défenseur vers sa cible.
          if (distToTarget > 0.5) {
            const moveAngleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = nord
            const bodyOrient = target[id].orientation ?? 0;
            const diff = Math.abs(((moveAngleDeg - bodyOrient + 540) % 360) - 180);
            // Course arrière (diff > 90°) → ×0.6 ; latéral (60-90°) → ×0.7.
            if (diff > 90) footworkMult *= 0.6;
            else if (diff > 60) footworkMult *= 0.7;
          }
          // Pivot plant-and-cut : changement de direction attaquant > 90°
          // entre 2 frames → latence 150 ms pour le défenseur.
          if (matchedAttId) {
            const lastAttPos = lastAttackerPosRef.current[matchedAttId];
            if (lastAttPos) {
              const adx = matchedAtt.x - lastAttPos.x;
              const ady = matchedAtt.y - lastAttPos.y;
              const lastDx = lastAttackerPosRef.current[`${matchedAttId}_last_dx`]?.x ?? 0;
              const lastDy = lastAttackerPosRef.current[`${matchedAttId}_last_dx`]?.y ?? 0;
              const adist = Math.hypot(adx, ady);
              const lastDist = Math.hypot(lastDx, lastDy);
              if (adist > 1 && lastDist > 1) {
                const dot = (adx * lastDx + ady * lastDy) / (adist * lastDist);
                const angleChange = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
                if (angleChange > 90) {
                  pivotLatencyRef.current[id] = (pivotLatencyRef.current[id] ?? 0) + 150;
                }
              }
              lastAttackerPosRef.current[`${matchedAttId}_last_dx`] = { x: adx, y: ady };
            }
          }
        }
        // Décompter la latence pivot active.
        if ((pivotLatencyRef.current[id] ?? 0) > 0) {
          pivotLatencyRef.current[id] = Math.max(0, pivotLatencyRef.current[id] - dt);
          if (pivotLatencyRef.current[id] > 0) {
            // Pendant la latence : ne bouge pas.
            return;
          }
        }

        // V3 — anticipation par profil : latence supplémentaire selon profil
        // (juste un freeze brief au début du drag, simulé via fatigue offset).
        // V3 — fatigue cumulée : au-delà d'un seuil, vitesse × 0.7.
        const fatigueDist = fatigueRef.current[id] ?? 0;
        const fatigueMult = advancedInertia && fatigueDist > 300 ? 0.7 : 1.0;

        // V3 — lecture du regard : si l'attaquant est dans le cône de regard
        // du défenseur (±60°), latence × 0.5 (mieux lu) ; sinon ×1.5.
        let gazeMult = 1.0;
        if (advancedInertia && realism.footworkRulesEnabled && matchedAtt) {
          const gaze = target[id].gazeOrientation ?? 0;
          const angleToAtt = (Math.atan2(matchedAtt.x - live.x, -(matchedAtt.y - live.y)) * 180) / Math.PI;
          const gazeDiff = Math.abs(((angleToAtt - gaze + 540) % 360) - 180);
          if (gazeDiff < 60) gazeMult = 1.2; // mieux placé, plus rapide
          else if (gazeDiff > 120) gazeMult = 0.7; // pris à contre-pied
        }

        // Sprint de récupération : en défense individuelle, si le défenseur est distancé (> 60 px)
        // de sa cible (par exemple lors d'une coupe rapide), il passe en course de repli (recovery sprint)
        // pouvant accélérer jusqu'à ×2.4 (repli défensif athlétique pour contester les coupes franches).
        const recoveryMult = cur.defenseSystem === 'man' && distToTarget > 60
          ? Math.min(2.4, 1.0 + (distToTarget - 60) / 75)
          : 1.0;

        const effectiveMaxPxPerMs = baseMaxPxPerMs * profileMult * footworkMult * fatigueMult * gazeMult * recoveryMult;
        const maxDelta = effectiveMaxPxPerMs * dt;
        const dist = distToTarget;

        if (dist <= maxDelta) {
          fatigueRef.current[id] = (fatigueRef.current[id] ?? 0) + dist;
          live.x = t.x;
          live.y = t.y;
        } else {
          const k = maxDelta / dist;
          fatigueRef.current[id] = (fatigueRef.current[id] ?? 0) + maxDelta;
          live.x += dx * k;
          live.y += dy * k;
        }
      });

      // Mémoriser la position et le cap de déplacement de l'attaquant en direct.
      (Object.entries(off) as [string, Point][]).forEach(([aid, pos]) => {
        const prevAtt = lastAttackerPosRef.current[aid];
        if (prevAtt) {
          const adx = pos.x - prevAtt.x;
          const ady = pos.y - prevAtt.y;
          const adist = Math.hypot(adx, ady);
          if (adist > 0.75) {
            const prevHeading = attackerLiveHeadingRef.current[aid];
            const smoothDx = prevHeading ? prevHeading.dx * 0.45 + (adx / adist) * 0.55 : adx / adist;
            const smoothDy = prevHeading ? prevHeading.dy * 0.45 + (ady / adist) * 0.55 : ady / adist;
            const len = Math.hypot(smoothDx, smoothDy) || 1;
            attackerLiveHeadingRef.current[aid] = {
              dx: smoothDx / len,
              dy: smoothDy / len,
              updatedAtMs: now,
            };
          }
        }
        lastAttackerPosRef.current[aid] = { x: pos.x, y: pos.y };
      });

      const settled = Object.entries(target).every(([id, p]) => {
        const live = livePositionsRef.current[id as DefenderId];
        return live && live.x === p.x && live.y === p.y;
      });
      pursuitSettledRef.current = !defenderPursuit.active && settled;
      setPursuitTick((t) => t + 1);
      if (pursuitSettledRef.current) {
        onPursuitSettledRef.current?.(defenderPursuit);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [defenderPursuit, replaying]);

  const pursuitFrame = useMemo<PlaybackFrame | null>(() => {
    if (replaying || !defenderPursuit || defenderPursuit.stepIndex !== state.activeStep) return null;
    const newPursuit = pursuitSnapshotRef.current !== defenderPursuit.snapshot;
    if (!newPursuit && pursuitSettledRef.current && !defenderPursuit.active) return null;
    // Le premier rendu doit déjà afficher le snapshot, avant le premier rAF.
    const positions = newPursuit ? defenderPursuit.snapshot : livePositionsRef.current;
    const blended: ComputedDefense = { ...staticFrame.defPos };
    const prevDefForOrient: Record<string, Point> = {};
    (Object.keys(blended) as DefenderId[]).forEach((id) => {
      const live = positions[id];
      if (!live) return;
      const targetSlot = staticFrame.defPos[id];
      const prevLive = prevLivePositionsRef.current[id];
      const distToTarget = targetSlot ? Math.hypot(targetSlot.x - live.x, targetSlot.y - live.y) : 0;
      if (distToTarget > 3 && targetSlot) {
        prevDefForOrient[id] = {
          x: live.x - (targetSlot.x - live.x),
          y: live.y - (targetSlot.y - live.y),
        };
      } else if (prevLive) {
        prevDefForOrient[id] = prevLive;
      }
      blended[id] = { ...blended[id], x: live.x, y: live.y };
    });
    recomputeDefenseFrameOrientations(state, staticFrame.off, staticFrame.carrier, blended, prevDefForOrient);
    // Si un défenseur est en pleine course de rattrapage (distToTarget > 25 px)
    // et que sa stance statique lui ferait tourner le dos à sa course (> 85°),
    // on ouvre ses épaules dans le sens de sa course tout en gardant un oeil sur le jeu.
    const hoop = getDefenseHoop(state);
    const ballPos = staticFrame.off[staticFrame.carrier];
    (Object.keys(blended) as DefenderId[]).forEach((id) => {
      const slot = blended[id];
      const targetSlot = staticFrame.defPos[id];
      const rule = state.rules[id];
      if (!slot || !targetSlot || rule?.bodyOrientation != null) return;
      const dx = targetSlot.x - slot.x;
      const dy = targetSlot.y - slot.y;
      const distToTarget = Math.hypot(dx, dy);
      if (distToTarget > 25) {
        const moveAngle = (Math.atan2(dx, -dy) * 180) / Math.PI;
        const diff = ((slot.orientation - moveAngle) % 360 + 540) % 360 - 180;
        if (Math.abs(diff) > 85) {
          const sideSign = diff >= 0 ? 1 : -1;
          const runBody = ((moveAngle + sideSign * 45) % 360 + 360) % 360;
          const recomputed = computeDefenderOrientation({
            defenderPos: { x: slot.x, y: slot.y },
            manPos: staticFrame.off[slot.matchedTo] ?? { x: targetSlot.x, y: targetSlot.y },
            ballPos: ballPos ?? { x: slot.x, y: slot.y },
            isCarrierDefender: slot.isCarrierDefender,
            stance: rule?.offBallStance,
            vsCarrier: rule?.vsCarrier,
            pnrRole: slot.pnrRole,
            manualBody: runBody,
            gazeLock: rule?.gazeLock,
            hoop,
          });
          slot.orientation = recomputed.bodyOrientation;
          slot.gazeOrientation = recomputed.gazeOrientation;
          slot.facing = recomputed.facing;
          slot.armBallSide = recomputed.armBallSide;
          slot.armManSide = recomputed.armManSide;
        }
      }
    });

    // Orientation en direct des attaquants déplacés manuellement à la souris :
    // pendant le drag actif, l'attaquant s'oriente dans le sens de sa course
    // et regarde devant lui ou vers le porteur de balle.
    let liveAttVisuals = staticFrame.attVisuals;
    if (defenderPursuit.active) {
      const now = performance.now();
      const hoop = getDefenseHoop(state);
      const ballPos = staticFrame.off[staticFrame.carrier];
      let hasLiveAttackerMove = false;
      const nextAttVisuals: ComputedAttackerVisuals = { ...staticFrame.attVisuals };
      (Object.keys(staticFrame.off) as AttackerId[]).forEach((aid) => {
        const heading = attackerLiveHeadingRef.current[aid];
        if (!heading || now - heading.updatedAtMs > 220) return;
        const attPos = staticFrame.off[aid];
        if (!attPos) return;
        hasLiveAttackerMove = true;
        const isCarrier = aid === staticFrame.carrier;
        const targetAhead = {
          x: attPos.x + heading.dx * 60,
          y: attPos.y + heading.dy * 60,
        };
        const prevBehind = {
          x: attPos.x - heading.dx * 60,
          y: attPos.y - heading.dy * 60,
        };
        const manualOverride = state.attackerOrientations?.[aid];
        const r = computeAttackerOrientation({
          attackerPos: attPos,
          role: isCarrier ? 'carrier' : 'cutter',
          ballPos: ballPos ?? attPos,
          hoop,
          nextPos: isCarrier ? undefined : targetAhead,
          prevPos: isCarrier ? prevBehind : undefined,
          manualBody: manualOverride?.body,
          manualGaze: manualOverride?.gaze,
        });
        nextAttVisuals[aid] = {
          orientation: r.bodyOrientation,
          gazeOrientation: r.gazeOrientation,
          facing: r.facing,
          armBallSide: r.armBallSide,
          armManSide: r.armManSide,
          isActivelyDribbling: isCarrier,
          isPostShotRecovery: false,
          isPassing: false,
          isCutting: !isCarrier,
        };
      });
      if (hasLiveAttackerMove) {
        liveAttVisuals = nextAttVisuals;
      }
    }

    return { ...staticFrame, defPos: blended, attVisuals: liveAttVisuals };
    // pursuitTick force l'invalidation à chaque rAF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defenderPursuit, staticFrame, pursuitTick, state.activeStep, replaying, state]);

  // B4 — Frame "match live" construite depuis `MatchState`. Priorité
  // maximale : quand un match IA tourne (ou est en pause à mi-possession),
  // l'utilisateur veut voir cet état, pas le scénario édité.
  const liveMatchFrame = useMemo<PlaybackFrame | null>(() => {
    if (replaying || !liveMatchState) return null;
    return {
      off: liveMatchState.off,
      defPos: liveMatchState.defPos,
      carrier: liveMatchState.carrier,
      screen: null,
      offBallScreens: [],
      stepIdx: state.activeStep,
      ballPos: liveMatchState.ballPos,
      ballInFlight: liveMatchState.intent.kind === 'pass',
      attVisuals: computeAttackerVisuals(state, state.activeStep),
      attackerIsScreening: {},
      attackerMovementType: {},
      attackingTeam: liveMatchState.attackingTeam,
    };
  }, [liveMatchState, state, replaying]);

  // Frame d'export : même mémoire synthétique que lecture et scrub.
  // Mémoïsée sur exportT + state, prioritaire sur les autres sources.
  const exportFrame = useMemo(() => {
    if (replaying || exportT == null) return null;
    const totalSteps = state.steps.length - 1;
    if (totalSteps <= 0) return null;
    const t = Math.max(0, Math.min(totalSteps, exportT));
    return resolveTimelineFrame(state, t);
  }, [exportT, state, replaying]);

  // Priorité : export > matchLive > playback > scrub > release animation > static.
  // L'export prime sur tout : c'est la frame que le capture loop veut.
  // Hors export (exportT == null → exportFrame == null), la chaîne retombe
  // sur le comportement existant à l'identique.
  const frame = recordedPlaybackFrame ?? exportFrame ?? liveMatchFrame ?? playFrame ?? scrubFrame ?? pursuitFrame ?? releaseFrame ?? staticFrame;
  const threatData = state.showThreats
    ? computeAttackerThreats(
        frame.off,
        frame.defPos,
        frame.carrier,
        getDefenseHoop(state, frame.attackingTeam),
        state.attackerProfiles
      )
    : null;

  const dynamic = !!(recordedPlaybackFrame || exportFrame || liveMatchFrame || playFrame || scrubFrame || pursuitFrame || releaseFrame);
  useLayoutEffect(() => {
    opts.onFrameChange?.({ state, frame, dynamic });
  }, [opts.onFrameChange, state, frame, dynamic]);
  return { frame, threatData };
}
