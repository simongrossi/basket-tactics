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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  ComputedDefense,
  DefenderId,
  DetectedOffBallScreen,
  Point,
} from '@/lib/types';
import type { DefenseReleaseTransition } from '@/hooks/useAppState';
import type { MatchState } from '@/lib/logic/match/gameLoop';
import {
  computeAttackerVisuals,
  effectiveDefensePositions,
  getMatchupsAt,
} from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import { activeBallCarrier, activeOffense } from '@/lib/logic/players';
import { buildStep0DetectionPositions } from '@/lib/logic/step0Detection';
import {
  resolveFrameAt,
  resolveFrameAtDeterministicScrub,
  type PlaybackFrame,
} from '@/lib/logic/playback/frameResolver';
import { computeAttackerThreats } from '@/lib/logic/threats';
import { usePlaybackAnimation } from '@/hooks/usePlaybackAnimation';

interface UseCourtFrameOptions {
  state: AppState;
  isPlaying: boolean;
  playbackSpeed: number;
  playbackStartT: number;
  scrubT: number | null | undefined;
  onPlaybackTick?: (t: number) => void;
  onPlaybackEnd?: () => void;
  /** Animation transitoire "Tout en auto réel". Hors playback/scrub, les
   *  positions défenseurs sont lerp depuis `fromPositions` vers les positions
   *  auto recomputées par l'engine, sur `durationMs`. */
  defenseReleaseTransition?: DefenseReleaseTransition | null;
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

export function useCourtFrame(opts: UseCourtFrameOptions): UseCourtFrameResult {
  const { state, isPlaying, playbackSpeed, playbackStartT, scrubT, onPlaybackTick, onPlaybackEnd, defenseReleaseTransition, liveMatchState } = opts;

  const [playFrame, setPlayFrame] = useState<PlaybackFrame | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Référence vers la frame PRÉCÉDENTE pour le rate limiter défenseurs
  // (cf. resolveFrameAt options.prevFrame). Permet de clamper les sauts
  // mid-segment causés par changements d'état d'écran. Réinitialisée
  // quand le playback redémarre.
  const prevFrameRef = useRef<PlaybackFrame | null>(null);

  const handleTick = useCallback((t: number) => {
    const cur = stateRef.current;
    const totalSteps = cur.steps.length - 1;
    if (totalSteps <= 0) return;
    if (t >= totalSteps) {
      setPlayFrame(null);
      prevFrameRef.current = null;
      onPlaybackTick?.(totalSteps);
      return;
    }
    onPlaybackTick?.(t);
    const frame = resolveFrameAt(cur, t, {
      prevFrame: prevFrameRef.current ?? undefined,
      collectDecisions: !!cur.showScreenDebug || !!cur.showPlayerDebug,
      profile: !!cur.showProfileOverlay,
    });
    if (frame) {
      setPlayFrame(frame);
      prevFrameRef.current = frame;
    }
    // onPlaybackTick volontairement hors deps : on lit stateRef, et changer
    // d'identité de callback ne doit pas re-créer la boucle d'animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePlaybackAnimation({
    isPlaying,
    speed: playbackSpeed,
    totalSteps: state.steps.length - 1,
    startT: playbackStartT,
    onTick: handleTick,
    onEnd: onPlaybackEnd,
  });

  // Reset du playFrame quand la lecture s'arrête (pause / fin externe).
  useEffect(() => {
    if (!isPlaying) {
      setPlayFrame(null);
      prevFrameRef.current = null;
    }
  }, [isPlaying]);

  // Frame statique (étape active, sans interpolation).
  const staticFrame = useMemo<PlaybackFrame>(() => {
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
  }, [state]);

  // Scrub frame (interpolation entre étapes pendant le drag de la timeline).
  // Même logique que la lecture continue avec un stepIdx arrondi pour afficher
  // l'étape la plus proche du curseur.
  //
  // J.1 — Parité scrub ↔ playback : on aligne les options de diagnostic
  // (collectDecisions, profile) entre les deux appels pour que les overlays
  // J.5/J.7 marchent aussi en scrub. La parité positionnelle est garantie
  // par resolveFrameAtDeterministicScrub qui reconstruit la mémoire depuis
  // le début du segment (cf. SCREEN-ENGINE.md).
  const scrubFrame = useMemo<PlaybackFrame | null>(() => {
    if (scrubT == null) return null;
    const totalSteps = state.steps.length - 1;
    if (totalSteps <= 0) return null;
    const t = Math.max(0, Math.min(totalSteps, scrubT));
    return resolveFrameAtDeterministicScrub(state, t, {
      stepIdx: Math.round(t),
      collectDecisions: !!state.showScreenDebug || !!state.showPlayerDebug,
      profile: !!state.showProfileOverlay,
    });
  }, [scrubT, state]);

  // Tick d'animation pour le release "Tout en auto réel". Force un re-render
  // à 60 fps pendant la durée de la transition pour fluidifier le blend.
  // Hors transition active, aucun effet.
  const [releaseTick, setReleaseTick] = useState(0);
  useEffect(() => {
    if (!defenseReleaseTransition) return;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - defenseReleaseTransition.startedAtMs;
      if (elapsed >= defenseReleaseTransition.durationMs) return;
      setReleaseTick((t) => t + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [defenseReleaseTransition]);

  // Frame "release animée" : si une transition est active ET qu'on n'est ni
  // en playback ni en scrub, on blend les positions défenseurs depuis les
  // positions capturées (avant clear des overrides) vers la cible auto (post
  // clear, recomputée par staticFrame). Easing cubique pour démarrer vite et
  // ralentir à l'arrivée — visuellement "le défenseur revient se mettre en
  // place" plutôt qu'un téléport.
  const releaseFrame = useMemo<PlaybackFrame | null>(() => {
    if (!defenseReleaseTransition) return null;
    const elapsed = performance.now() - defenseReleaseTransition.startedAtMs;
    if (elapsed >= defenseReleaseTransition.durationMs) return null;
    const raw = elapsed / defenseReleaseTransition.durationMs;
    // ease-out cubique : f(t) = 1 - (1-t)³
    const eased = 1 - Math.pow(1 - raw, 3);
    const blended: ComputedDefense = { ...staticFrame.defPos };
    (Object.keys(blended) as DefenderId[]).forEach((id) => {
      const target = staticFrame.defPos[id];
      const from = defenseReleaseTransition.fromPositions[id];
      if (!from || !target) return;
      blended[id] = {
        ...target,
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      };
    });
    return { ...staticFrame, defPos: blended };
    // releaseTick force l'invalidation à chaque rAF tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defenseReleaseTransition, staticFrame, releaseTick]);

  // B4 — Frame "match live" construite depuis `MatchState`. Priorité
  // maximale : quand un match IA tourne (ou est en pause à mi-possession),
  // l'utilisateur veut voir cet état, pas le scénario édité.
  const liveMatchFrame = useMemo<PlaybackFrame | null>(() => {
    if (!liveMatchState) return null;
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
  }, [liveMatchState, state]);

  // Priorité : matchLive > playback > scrub > release animation > static.
  // Le matchLive prime sur tout : c'est ce que l'utilisateur regarde quand
  // un match IA tourne. Playback/scrub n'ont pas de sens pendant un live.
  const frame = liveMatchFrame ?? playFrame ?? scrubFrame ?? releaseFrame ?? staticFrame;
  const threatData = state.showThreats
    ? computeAttackerThreats(
        frame.off,
        frame.defPos,
        frame.carrier,
        undefined,
        state.attackerProfiles
      )
    : null;

  return { frame, threatData };
}
