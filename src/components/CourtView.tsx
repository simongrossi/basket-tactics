'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  AppState,
  AttackerId,
  DefenderId,
  PlayerId,
  Annotation,
  Tool,
  Point,
  ComputedDefense,
  AttackerPositions,
} from '@/lib/types';
import { CourtBackground, ArrowMarkers } from './Court';
import { Player, Ball } from './Player';
import { AnnotationView } from './Annotations';
import { Matchups, HelpLines, ScreenIndicator, ZoneOverlay, OffBallScreenIndicator } from './Overlays';
import { ZoneCoverage } from './ZoneCoverage';
import { PassLanesOverlay } from './PassLanesOverlay';
import { HelpDebugOverlay } from './HelpDebugOverlay';
import { FieldOfViewOverlay } from './FieldOfViewOverlay';
import { effectiveDefensePositions, getMatchupsAt, computeAttackerVisuals } from '@/lib/logic/engine';
import { lerpAngleDeg } from '@/lib/logic/orientation';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import type { DetectedOffBallScreen } from '@/lib/types';
import { detectTriggers } from '@/lib/logic/triggers';
import { getZoneLayout, mirrorZoneLayout, applyZoneOverrides } from '@/lib/data/zones';
import { ZoneEditOverlay, ZoneRegionMenu } from './ZoneEditOverlay';
import { COURT, PLAYER_RADIUS, FULL_COURT_HEIGHT, FULL_COURT_INNER_MAX_Y } from '@/lib/data/court';
import {
  clamp, distance, curveAroundObstacle, resolvePlayerCollisions, makeCluster,
  pickBlockingCluster, pickStaggeredPair, curveAroundStaggeredPair, computeBallFrame,
} from '@/lib/logic/geometry';
import { ContextMenu } from './ContextMenu';
import { ActionOrderBadges } from './ActionOrderBadges';
import { HeatmapOverlay } from './HeatmapOverlay';
import { ThreatOverlay } from './ThreatOverlay';
import { BestActionOverlay } from './BestActionOverlay';
import { computeAttackerThreats } from '@/lib/logic/threats';
import { evaluateOffensiveOptions, bestOffensiveAction } from '@/lib/logic/offense';

interface CourtViewProps {
  state: AppState;
  onMoveAttacker: (id: AttackerId, x: number, y: number) => void;
  onMoveDefender: (id: DefenderId, x: number, y: number) => void;
  onAddAnnotation: (a: Annotation) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onApplyDefenderProfile: (dId: DefenderId, profile: import('@/lib/data/defenderProfiles').DefenderProfile) => void;
  onClearDefenseOverride: (dId: DefenderId) => void;
  onSetBallCarrier: (oId: AttackerId) => void;
  onSetForcedScreener: (oId: AttackerId | null) => void;
  onClearAnnotationsFor: (oId: AttackerId) => void;
  onSetAttackerHand: (oId: AttackerId, hand: 'right' | 'left') => void;
  onSetAttackerProfile: (oId: AttackerId, profile: import('@/lib/types').OffensiveProfile) => void;
  onSetZoneOverride: (regionId: string, override: Partial<import('@/lib/types').ZoneRegionOverride>) => void;
  onClearZoneOverride: (regionId: string) => void;
  onDeleteAnnotation: (idx: number) => void;
  onSetTool: (t: Tool) => void;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlaybackEnd?: () => void;
  onPlaybackTick?: (t: number) => void;
  scrubT?: number | null;
}

interface PendingAnnotation {
  type: Tool;
  fromId: AttackerId;
  from: Point;
  to: Point;
  toId?: AttackerId | null;
}

interface PlaybackFrame {
  off: AttackerPositions;
  defPos: ComputedDefense;
  carrier: AttackerId;
  screen: ReturnType<typeof detectScreen>;
  offBallScreens: DetectedOffBallScreen[];
  stepIdx: number;
  ballPos: Point;
  ballInFlight: boolean;
  attVisuals: import('@/lib/types').ComputedAttackerVisuals;
}

export function CourtView(props: CourtViewProps) {
  const { state } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ id: PlayerId; isDef: boolean } | null>(null);
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  type CtxMenuState =
    | { kind: 'defender'; dId: DefenderId; x: number; y: number }
    | { kind: 'attacker'; oId: AttackerId; x: number; y: number };
  const [zoneRegionMenu, setZoneRegionMenu] = useState<{ regionId: string; x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [playFrame, setPlayFrame] = useState<PlaybackFrame | null>(null);

  // Playback animation
  const playStart = useRef(0);
  // Refs pour ne PAS faire dépendre l'effet de `state` (sinon chaque
  // mutation reset playStart et la lecture n'avance jamais).
  const stateRef = useRef(state);
  stateRef.current = state;
  const onPlaybackTickRef = useRef(props.onPlaybackTick);
  onPlaybackTickRef.current = props.onPlaybackTick;
  const onPlaybackEndRef = useRef(props.onPlaybackEnd);
  onPlaybackEndRef.current = props.onPlaybackEnd;

  useEffect(() => {
    if (!props.isPlaying) {
      setPlayFrame(null);
      return;
    }
    playStart.current = performance.now();

    const tick = () => {
      const cur = stateRef.current;
      const elapsed = performance.now() - playStart.current;
      const stepDuration = 1500 / props.playbackSpeed;
      const totalSteps = cur.steps.length - 1;
      if (totalSteps <= 0) {
        window.clearInterval(intervalId);
        return;
      }
      const globalT = elapsed / stepDuration;
      if (globalT >= totalSteps) {
        window.clearInterval(intervalId);
        setPlayFrame(null);
        onPlaybackTickRef.current?.(totalSteps);
        onPlaybackEndRef.current?.();
        return;
      }
      onPlaybackTickRef.current?.(globalT);
      const idxA = Math.floor(globalT);
      const idxB = idxA + 1;
      const localT = globalT - idxA;
      const a = cur.steps[idxA];
      const b = cur.steps[idxB];
      const defA = effectiveDefensePositions(cur, idxA);
      const defB = effectiveDefensePositions(cur, idxB);

      // Interpolation des attaquants AVEC contournement d'obstacles. Les
      // obstacles considérés : les autres attaquants (position moyenne A-B)
      // et les défenseurs (position moyenne A-B). Évite qu'un attaquant
      // traverse un autre joueur entre deux étapes.
      const off = {} as AttackerPositions;
      const attackerIds = Object.keys(a.off) as AttackerId[];
      const defenderIds = Object.keys(defA) as DefenderId[];
      const radiusObstacle = PLAYER_RADIUS + 2;
      attackerIds.forEach((id) => {
        const from = a.off[id];
        const to = b.off[id];
        const obstacles: { center: Point; radius: number; defenderToSkip: DefenderId }[] = [];
        attackerIds.forEach((other) => {
          if (other === id) return;
          obstacles.push({
            center: {
              x: (a.off[other].x + b.off[other].x) / 2,
              y: (a.off[other].y + b.off[other].y) / 2,
            },
            radius: radiusObstacle,
            defenderToSkip: 'D1' as DefenderId, // valeur arbitraire, jamais filtrée car l'attaquant n'est pas un DefenderId
          });
        });
        defenderIds.forEach((dId) => {
          obstacles.push({
            center: {
              x: (defA[dId].x + defB[dId].x) / 2,
              y: (defA[dId].y + defB[dId].y) / 2,
            },
            radius: radiusObstacle,
            defenderToSkip: 'D1' as DefenderId,
          });
        });
        let p: Point = {
          x: from.x + (to.x - from.x) * localT,
          y: from.y + (to.y - from.y) * localT,
        };
        const blocking = pickBlockingCluster(from, to, obstacles);
        if (blocking) {
          p = curveAroundObstacle(from, to, blocking.center, blocking.radius, localT);
        }
        off[id] = p;
      });

      const carrier = localT < 0.5 ? a.ballCarrier : b.ballCarrier;
      // Détection d'écran sur la frame en cours pour piloter l'évitement
      let screen: ReturnType<typeof detectScreen> = null;
      let offBallScreens: DetectedOffBallScreen[] = [];
      if (cur.defenseSystem === 'man') {
        const matchups = getMatchupsAt(cur.steps, idxB - 1);
        const defPosLinear = {} as Record<DefenderId, Point>;
        (Object.keys(defA) as DefenderId[]).forEach((id) => {
          defPosLinear[id] = {
            x: defA[id].x + (defB[id].x - defA[id].x) * localT,
            y: defA[id].y + (defB[id].y - defA[id].y) * localT,
          };
        });
        const forced = (localT < 0.5 ? a : b).forcedScreener;
        screen = detectScreen(off, carrier, matchups, defPosLinear, cur.screenRadius, forced);
        offBallScreens = detectOffBallScreens(off, carrier, matchups, defPosLinear, cur.screenRadius);
      }

      // Liste des CLUSTERS (poseur + son défenseur) à contourner.
      // Important : on utilise la position MOYENNE entre A et B pour
      // que l'obstacle soit STABLE pendant tout le segment (sinon la
      // courbe Bezier est recalculée à chaque frame avec une géométrie
      // qui change, ce qui produit un effet de clignotement quand le
      // segment passe juste à la limite du cercle de l'obstacle).
      const screenerObstacles: { center: Point; radius: number; defenderToSkip: DefenderId }[] = [];
      const linkDist = PLAYER_RADIUS * 4; // 64px : on lie poseur et son défenseur
      const baseR = PLAYER_RADIUS + 4; // 20px — clearance autour du cluster (tight)
      const midpointOff = (id: AttackerId): Point => ({
        x: (a.off[id].x + b.off[id].x) / 2,
        y: (a.off[id].y + b.off[id].y) / 2,
      });
      const midpointDef = (id: DefenderId): Point => ({
        x: (defA[id].x + defB[id].x) / 2,
        y: (defA[id].y + defB[id].y) / 2,
      });
      if (screen) {
        const sPos = midpointOff(screen.screener);
        const sDef = midpointDef(screen.screenerDef);
        const c = makeCluster(sPos, [sDef], linkDist, baseR);
        screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef });
      }
      offBallScreens.forEach((s) => {
        const sPos = midpointOff(s.screener);
        const sDef = midpointDef(s.screenerDef);
        const c = makeCluster(sPos, [sDef], linkDist, baseR);
        screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: s.screenerDef });
      });

      const defPos = {} as ComputedDefense;
      (Object.keys(defA) as DefenderId[]).forEach((id) => {
        let p: Point = {
          x: defA[id].x + (defB[id].x - defA[id].x) * localT,
          y: defA[id].y + (defB[id].y - defA[id].y) * localT,
        };
        // Staggered screens : si 2 écrans en quinconce (côtés opposés du
        // segment) → courbe en S réelle (pickStaggeredPair + cubic Bezier).
        // Sinon (un seul ou tous du même côté) → super-cluster + courbe
        // simple (pickBlockingCluster).
        const candidates = screenerObstacles.filter((o) => id !== o.defenderToSkip);
        const pair = pickStaggeredPair(defA[id], defB[id], candidates);
        if (pair) {
          p = curveAroundStaggeredPair(defA[id], defB[id], pair[0], pair[1], localT);
        } else {
          const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
          if (blocking) {
            p = curveAroundObstacle(defA[id], defB[id], blocking.center, blocking.radius, localT);
          }
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
          orientation: lerpAngleDeg(defA[id].orientation, defB[id].orientation, localT),
          gazeOrientation: lerpAngleDeg(defA[id].gazeOrientation, defB[id].gazeOrientation, localT),
          facing: {
            x: defA[id].facing.x + (defB[id].facing.x - defA[id].facing.x) * localT,
            y: defA[id].facing.y + (defB[id].facing.y - defA[id].facing.y) * localT,
          },
          armBallSide: {
            x: defA[id].armBallSide.x + (defB[id].armBallSide.x - defA[id].armBallSide.x) * localT,
            y: defA[id].armBallSide.y + (defB[id].armBallSide.y - defA[id].armBallSide.y) * localT,
          },
          armManSide: {
            x: defA[id].armManSide.x + (defB[id].armManSide.x - defA[id].armManSide.x) * localT,
            y: defA[id].armManSide.y + (defB[id].armManSide.y - defA[id].armManSide.y) * localT,
          },
        };
      });

      // Solveur de collisions strict : aucun défenseur ne se superpose
      // à un autre joueur (sauf son matchedTo).
      resolvePlayerCollisions(
        defPos as unknown as Record<string, ComputedDefense[DefenderId]>,
        off,
        PLAYER_RADIUS * 2 + 2
      );

      const ball = computeBallFrame(
        a.off[a.ballCarrier],
        b.off[b.ballCarrier],
        a.ballCarrier !== b.ballCarrier,
        localT
      );
      const attVisuals = computeAttackerVisuals(cur, idxB);
      setPlayFrame({ off, defPos, carrier, screen, offBallScreens, stepIdx: idxA, ballPos: ball.pos, ballInFlight: ball.inFlight, attVisuals });
    };
    // setInterval plus déterministe que requestAnimationFrame pour ce cas
    // (pas de soucis avec re-renders qui restartent la boucle).
    const intervalId = window.setInterval(tick, 33); // ~30fps
    tick(); // premier frame immédiat
    return () => window.clearInterval(intervalId);
  }, [props.isPlaying, props.playbackSpeed]);

  // Computed (static frame)
  const staticFrame = useMemo<PlaybackFrame>(() => {
    const cur = state.steps[state.activeStep];
    const defPos = effectiveDefensePositions(state, state.activeStep);
    let screen: ReturnType<typeof detectScreen> = null;
    let offBallScreens: DetectedOffBallScreen[] = [];
    if (state.defenseSystem === 'man') {
      const matchups = getMatchupsAt(state.steps, state.activeStep - 1);
      const defPosExtracted = extractDefPositions(defPos);
      screen = detectScreen(cur.off, cur.ballCarrier, matchups, defPosExtracted, state.screenRadius, cur.forcedScreener);
      offBallScreens = detectOffBallScreens(cur.off, cur.ballCarrier, matchups, defPosExtracted, state.screenRadius);
    }
    const carrierPos = cur.off[cur.ballCarrier];
    const ballPos: Point = carrierPos
      ? { x: carrierPos.x + 16, y: carrierPos.y - 16 }
      : { x: 0, y: 0 };
    return {
      off: cur.off,
      defPos,
      carrier: cur.ballCarrier,
      screen,
      offBallScreens,
      stepIdx: state.activeStep,
      ballPos,
      ballInFlight: false,
      attVisuals: computeAttackerVisuals(state, state.activeStep),
    };
  }, [state]);

  // Scrub frame (interpolation entre étapes pendant le drag de la timeline)
  const scrubFrame = useMemo<PlaybackFrame | null>(() => {
    if (props.scrubT == null) return null;
    const totalSteps = state.steps.length - 1;
    if (totalSteps <= 0) return null;
    const t = Math.max(0, Math.min(totalSteps, props.scrubT));
    const idxA = Math.floor(t);
    const idxB = Math.min(idxA + 1, totalSteps);
    const localT = t - idxA;
    const a = state.steps[idxA];
    const b = state.steps[idxB];
    const defA = effectiveDefensePositions(state, idxA);
    const defB = effectiveDefensePositions(state, idxB);
    // Interpolation des attaquants AVEC contournement (cf. playFrame).
    const off = {} as AttackerPositions;
    const scrubAttIds = Object.keys(a.off) as AttackerId[];
    const scrubDefIds = Object.keys(defA) as DefenderId[];
    const scrubObstacleR = PLAYER_RADIUS + 2;
    scrubAttIds.forEach((id) => {
      const from = a.off[id];
      const to = b.off[id];
      const obstacles: { center: Point; radius: number; defenderToSkip: DefenderId }[] = [];
      scrubAttIds.forEach((other) => {
        if (other === id) return;
        obstacles.push({
          center: { x: (a.off[other].x + b.off[other].x) / 2, y: (a.off[other].y + b.off[other].y) / 2 },
          radius: scrubObstacleR,
          defenderToSkip: 'D1' as DefenderId,
        });
      });
      scrubDefIds.forEach((dId) => {
        obstacles.push({
          center: { x: (defA[dId].x + defB[dId].x) / 2, y: (defA[dId].y + defB[dId].y) / 2 },
          radius: scrubObstacleR,
          defenderToSkip: 'D1' as DefenderId,
        });
      });
      let p: Point = {
        x: from.x + (to.x - from.x) * localT,
        y: from.y + (to.y - from.y) * localT,
      };
      const blocking = pickBlockingCluster(from, to, obstacles);
      if (blocking) {
        p = curveAroundObstacle(from, to, blocking.center, blocking.radius, localT);
      }
      off[id] = p;
    });
    const carrier = localT < 0.5 ? a.ballCarrier : b.ballCarrier;
    let screen: ReturnType<typeof detectScreen> = null;
    let offBallScreens: DetectedOffBallScreen[] = [];
    if (state.defenseSystem === 'man') {
      const matchups = getMatchupsAt(state.steps, Math.max(0, idxB - 1));
      const defPosLinear = {} as Record<DefenderId, Point>;
      (Object.keys(defA) as DefenderId[]).forEach((id) => {
        defPosLinear[id] = {
          x: defA[id].x + (defB[id].x - defA[id].x) * localT,
          y: defA[id].y + (defB[id].y - defA[id].y) * localT,
        };
      });
      const forced = (localT < 0.5 ? a : b).forcedScreener;
      screen = detectScreen(off, carrier, matchups, defPosLinear, state.screenRadius, forced);
      offBallScreens = detectOffBallScreens(off, carrier, matchups, defPosLinear, state.screenRadius);
    }
    // Obstacles stables (midpoint A-B) pour la durée du segment.
    const screenerObstacles: { center: Point; radius: number; defenderToSkip: DefenderId }[] = [];
    const linkDist = PLAYER_RADIUS * 4;
    const baseR = PLAYER_RADIUS + 4;
    const midpointOff = (id: AttackerId): Point => ({
      x: (a.off[id].x + b.off[id].x) / 2,
      y: (a.off[id].y + b.off[id].y) / 2,
    });
    const midpointDef = (id: DefenderId): Point => ({
      x: (defA[id].x + defB[id].x) / 2,
      y: (defA[id].y + defB[id].y) / 2,
    });
    if (screen) {
      const sPos = midpointOff(screen.screener);
      const sDef = midpointDef(screen.screenerDef);
      const c = makeCluster(sPos, [sDef], linkDist, baseR);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef });
    }
    offBallScreens.forEach((s) => {
      const sPos = midpointOff(s.screener);
      const sDef = midpointDef(s.screenerDef);
      const c = makeCluster(sPos, [sDef], linkDist, baseR);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: s.screenerDef });
    });

    const defPos = {} as ComputedDefense;
    (Object.keys(defA) as DefenderId[]).forEach((id) => {
      let p: Point = {
        x: defA[id].x + (defB[id].x - defA[id].x) * localT,
        y: defA[id].y + (defB[id].y - defA[id].y) * localT,
      };
      const candidates = screenerObstacles.filter((o) => id !== o.defenderToSkip);
      const pair = pickStaggeredPair(defA[id], defB[id], candidates);
      if (pair) {
        p = curveAroundStaggeredPair(defA[id], defB[id], pair[0], pair[1], localT);
      } else {
        const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
        if (blocking) {
          p = curveAroundObstacle(defA[id], defB[id], blocking.center, blocking.radius, localT);
        }
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
        orientation: lerpAngleDeg(defA[id].orientation, defB[id].orientation, localT),
        gazeOrientation: lerpAngleDeg(defA[id].gazeOrientation, defB[id].gazeOrientation, localT),
        armBallSide: {
          x: defA[id].armBallSide.x + (defB[id].armBallSide.x - defA[id].armBallSide.x) * localT,
          y: defA[id].armBallSide.y + (defB[id].armBallSide.y - defA[id].armBallSide.y) * localT,
        },
        armManSide: {
          x: defA[id].armManSide.x + (defB[id].armManSide.x - defA[id].armManSide.x) * localT,
          y: defA[id].armManSide.y + (defB[id].armManSide.y - defA[id].armManSide.y) * localT,
        },
        facing: {
          x: defA[id].facing.x + (defB[id].facing.x - defA[id].facing.x) * localT,
          y: defA[id].facing.y + (defB[id].facing.y - defA[id].facing.y) * localT,
        },
      };
    });

    // Solveur de collisions strict
    resolvePlayerCollisions(
      defPos as unknown as Record<string, ComputedDefense[DefenderId]>,
      off,
      PLAYER_RADIUS * 2 + 2
    );

    const ball = computeBallFrame(
      a.off[a.ballCarrier],
      b.off[b.ballCarrier],
      a.ballCarrier !== b.ballCarrier,
      localT
    );
    return {
      off,
      defPos,
      carrier,
      screen,
      offBallScreens,
      stepIdx: Math.round(t),
      ballPos: ball.pos,
      ballInFlight: ball.inFlight,
      attVisuals: computeAttackerVisuals(state, idxB),
    };
  }, [props.scrubT, state]);

  const frame = playFrame ?? scrubFrame ?? staticFrame;
  const threatData = state.showThreats
    ? computeAttackerThreats(
        frame.off,
        frame.defPos,
        state.steps[frame.stepIdx]?.ballCarrier ?? frame.carrier,
        undefined,
        state.attackerProfiles
      )
    : null;

  // Pointer events
  const svgPoint = useCallback((evt: React.PointerEvent | PointerEvent): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }, []);

  const findPlayerAt = useCallback(
    (pt: Point): PlayerId | null => {
      const cur = state.steps[state.activeStep];
      for (const id in cur.off) {
        if (distance(cur.off[id as AttackerId], pt) < PLAYER_RADIUS + 4) return id as AttackerId;
      }
      for (const id in state.defenseInitial) {
        if (distance(state.defenseInitial[id as DefenderId], pt) < PLAYER_RADIUS + 4) return id as DefenderId;
      }
      return null;
    },
    [state]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setCtxMenu(null);
    if (props.isPlaying) return;
    const target = (e.target as Element).closest('g[data-id]');
    const pt = svgPoint(e);

    if (state.tool === 'move') {
      if (!target) return;
      const id = target.getAttribute('data-id') as PlayerId;
      setDragging({ id, isDef: id.startsWith('D') });
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const fromId = (target?.getAttribute('data-id') as PlayerId | null) ?? findPlayerAt(pt);
    if (!fromId || !fromId.startsWith('O')) return;
    setPending({
      type: state.tool,
      fromId: fromId as AttackerId,
      from: { ...state.steps[state.activeStep].off[fromId as AttackerId] },
      to: pt,
    });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = svgPoint(e);
    if (dragging && state.tool === 'move') {
      const maxY = state.fullCourt ? FULL_COURT_INNER_MAX_Y : COURT.innerMaxY;
      const x = clamp(Math.round(pt.x), COURT.marginX, COURT.innerMaxX);
      const y = clamp(Math.round(pt.y), COURT.marginY, maxY);
      if (dragging.isDef) props.onMoveDefender(dragging.id as DefenderId, x, y);
      else props.onMoveAttacker(dragging.id as AttackerId, x, y);
      return;
    }
    if (pending) {
      const target = (e.target as Element).closest('g[data-id]');
      const overId = (target?.getAttribute('data-id') as PlayerId | null) ?? findPlayerAt(pt);
      const toId = overId && overId.startsWith('O') ? (overId as AttackerId) : null;
      setPending({ ...pending, to: pt, toId });
    }
  };

  const onPointerUp = () => {
    if (dragging) {
      setDragging(null);
      return;
    }
    if (pending) {
      const d = distance(pending.from, pending.to);
      if (d < 15) {
        setPending(null);
        return;
      }
      props.onAddAnnotation({
        type: pending.type as Annotation['type'],
        fromId: pending.fromId,
        toId: pending.toId ?? null,
        from: pending.from,
        to: pending.to,
      });
      setPending(null);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    // Annotation : suppression directe au clic-droit sur la flèche
    const annotationG = (e.target as Element).closest('g[data-annotation-idx]');
    const annoIdxStr = annotationG?.getAttribute('data-annotation-idx');
    if (annoIdxStr !== null && annoIdxStr !== undefined) {
      e.preventDefault();
      props.onDeleteAnnotation(parseInt(annoIdxStr, 10));
      return;
    }

    const target = (e.target as Element).closest('g[data-id]');
    const domId = target?.getAttribute('data-id');

    let dId: DefenderId | null = null;
    let oId: AttackerId | null = null;

    if (domId?.startsWith('D')) {
      dId = domId as DefenderId;
    } else if (domId?.startsWith('O')) {
      oId = domId as AttackerId;
    } else {
      // Fallback : cherche le joueur le plus proche du point cliqué (couvre
      // le cas où un poseur d'écran est rendu au-dessus, masquant le data-id).
      const pt = svgPoint(e as unknown as React.PointerEvent);
      let bestDist = Infinity;
      (Object.entries(frame.defPos) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(
        ([id, p]) => {
          const d = distance(pt, { x: p.x, y: p.y });
          if (d < PLAYER_RADIUS + 6 && d < bestDist) {
            bestDist = d;
            dId = id;
            oId = null;
          }
        }
      );
      (Object.entries(frame.off) as [AttackerId, Point][]).forEach(([id, p]) => {
        const d = distance(pt, p);
        if (d < PLAYER_RADIUS + 6 && d < bestDist) {
          bestDist = d;
          oId = id;
          dId = null;
        }
      });
    }
    if (!dId && !oId) return;
    e.preventDefault();
    const wrap = svgRef.current?.parentElement?.getBoundingClientRect();
    if (!wrap) return;
    const x = e.clientX - wrap.left;
    const y = e.clientY - wrap.top;
    if (dId) setCtxMenu({ kind: 'defender', dId, x, y });
    else if (oId) setCtxMenu({ kind: 'attacker', oId, x, y });
  };

  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        background: '#f5f5f4',
        borderRadius: 12,
        padding: 6,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(15, 23, 42, 0.06)',
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${COURT.width} ${state.fullCourt ? FULL_COURT_HEIGHT : COURT.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <ArrowMarkers />
        <CourtBackground fullCourt={state.fullCourt} attackingDirection={state.attackingDirection} />
        {state.defenseSystem === 'zone' && (() => {
          const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
          const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
          const zoneLayout = applyZoneOverrides(oriented, state.zoneOverrides);
          if (state.zoneEditMode) {
            return (
              <ZoneEditOverlay
                layout={zoneLayout}
                toCourtPoint={(cx, cy) => {
                  const svg = svgRef.current;
                  if (!svg) return null;
                  const pt = svg.createSVGPoint();
                  pt.x = cx;
                  pt.y = cy;
                  const ctm = svg.getScreenCTM();
                  if (!ctm) return null;
                  const t = pt.matrixTransform(ctm.inverse());
                  return { x: t.x, y: t.y };
                }}
                onMoveHomePos={(regionId, pos) =>
                  props.onSetZoneOverride(regionId, { homePos: { x: Math.round(pos.x), y: Math.round(pos.y) } })
                }
                onUpdatePolygon={(regionId, polygon) =>
                  props.onSetZoneOverride(regionId, { polygon })
                }
                onSelectRegion={(regionId, e) => {
                  const wrap = svgRef.current?.parentElement?.getBoundingClientRect();
                  if (!wrap) return;
                  setZoneRegionMenu({
                    regionId,
                    x: e.clientX - wrap.left,
                    y: e.clientY - wrap.top,
                  });
                }}
              />
            );
          }
          return <ZoneOverlay layout={zoneLayout} show />;
        })()}
        {state.defenseSystem === 'zone' ? (() => {
          const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
          const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
          const zoneLayout = applyZoneOverrides(oriented, state.zoneOverrides);
          return (
            <ZoneCoverage
              off={frame.off}
              defPos={frame.defPos}
              layout={zoneLayout}
              show={state.showMatchups && state.showZoneTracking !== false}
            />
          );
        })() : (
          <Matchups
            off={frame.off}
            defPos={frame.defPos}
            show={state.showMatchups}
            highlightSwitches={state.showSwitchMatchups !== false}
          />
        )}
        <HeatmapOverlay
          defPos={frame.defPos}
          off={frame.off}
          fullCourt={state.fullCourt}
          show={!!state.showHeatmap}
        />
        {/* Champs de vision défenseurs — activés individuellement via clic-droit
            (rule.showFieldOfView). Rendus AVANT les sprites joueur. */}
        <FieldOfViewOverlay defPos={frame.defPos} rules={state.rules} />
        <HelpLines off={frame.off} defPos={frame.defPos} defenseDistance={state.defenseDistance} show={state.showHelpLines} />
        {/* Anneaux de menace — rendus AVANT les sprites pour que les icônes
            joueur passent par-dessus l'anneau (visuel plus propre). */}
        {threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="rings" />}
        {state.showGhosts && state.activeStep > 0 && !props.isPlaying && props.scrubT == null && (
          <GhostLayer state={state} stepIdx={state.activeStep - 1} />
        )}
        <g>
          {(() => {
            const screenerIds = new Set<AttackerId>();
            if (frame.screen?.screener) screenerIds.add(frame.screen.screener);
            frame.offBallScreens.forEach((s) => screenerIds.add(s.screener));
            const forcedScreenerId = state.steps[state.activeStep]?.forcedScreener;
            return (
              <>
                {(Object.entries(frame.off) as [AttackerId, Point][])
                  .filter(([id]) => !screenerIds.has(id))
                  .map(([id, pos]) => (
                    <Player
                      key={id}
                      id={id}
                      pos={pos}
                      isAttacker
                      isForcedScreener={id === forcedScreenerId}
                      showLockBadges={state.showLockBadges !== false}
                      showForcedScreenerBadge={state.showForcedScreenerBadge !== false}
                      orientation={frame.attVisuals[id]?.orientation}
                      gazeOrientation={frame.attVisuals[id]?.gazeOrientation}
                      facing={frame.attVisuals[id]?.facing}
                      armBallSide={frame.attVisuals[id]?.armBallSide}
                      armManSide={frame.attVisuals[id]?.armManSide}
                    />
                  ))}
                {(Object.entries(frame.defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(
                  ([id, p]) => (
                    <Player
                      key={id}
                      id={id}
                      pos={p}
                      isAttacker={false}
                      isCarrierDefender={p.isCarrierDefender}
                      isLate={p.late}
                      onScreen={p.onScreen}
                      helpFactor={p.helpFactor}
                      facing={p.facing}
                      isOverridden={!!state.steps[state.activeStep]?.defenseOverrides?.[id]}
                      closingOut={p.closingOut}
                      overClosed={p.overClosed}
                      denying={p.denying}
                      pnrRole={p.pnrRole}
                      orientation={p.orientation}
                      gazeOrientation={p.gazeOrientation}
                      armBallSide={p.armBallSide}
                      armManSide={p.armManSide}
                      showStateRings={state.showStateRings !== false}
                      showLockBadges={state.showLockBadges !== false}
                      showLateRing={state.showLateRing !== false}
                      showCloseoutRing={state.showCloseoutRing !== false}
                      showDenyingRing={state.showDenyingRing !== false}
                    />
                  )
                )}
                {Array.from(screenerIds).map((id) =>
                  frame.off[id] ? (
                    <Player
                      key={`screener-${id}`}
                      id={id}
                      pos={frame.off[id]}
                      isAttacker
                      isForcedScreener={id === forcedScreenerId}
                      showLockBadges={state.showLockBadges !== false}
                      showForcedScreenerBadge={state.showForcedScreenerBadge !== false}
                      orientation={frame.attVisuals[id]?.orientation}
                      gazeOrientation={frame.attVisuals[id]?.gazeOrientation}
                      facing={frame.attVisuals[id]?.facing}
                      armBallSide={frame.attVisuals[id]?.armBallSide}
                      armManSide={frame.attVisuals[id]?.armManSide}
                    />
                  ) : null
                )}
              </>
            );
          })()}
        </g>
        {/* Badges % de menace + flèche meilleure action — rendus APRÈS les
            joueurs pour passer AU-DESSUS des icônes (~17px de rayon). */}
        {threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="badges" />}
        {state.showBestAction && (() => {
          const carrier = state.steps[frame.stepIdx]?.ballCarrier ?? 'O1';
          const actions = evaluateOffensiveOptions(frame.off, frame.defPos, carrier, undefined, state.attackerProfiles);
          const best = bestOffensiveAction(actions);
          if (!best) return null;
          return <BestActionOverlay off={frame.off} carrier={carrier} best={best} show />;
        })()}
        <g>
          {state.steps[frame.stepIdx]?.annotations.map((a, i) => (
            <g key={i} data-annotation-idx={i} style={{ cursor: 'context-menu' }}>
              <AnnotationView annotation={a} />
              {/* Hit-test invisible : élargit la zone de clic-droit pour
                  la suppression depuis le terrain. */}
              <line
                x1={a.from.x}
                y1={a.from.y}
                x2={a.to.x}
                y2={a.to.y}
                stroke="transparent"
                strokeWidth={14}
                strokeLinecap="round"
              />
            </g>
          ))}
          {pending && pending.from && <AnnotationView annotation={pending as Annotation} preview />}
        </g>
        <PassLanesOverlay
          off={frame.off}
          defPos={frame.defPos}
          carrier={frame.carrier}
          show={state.showPassLanes}
          showContested={state.showContestedPass !== false}
          showBlocked={state.showBlockedPass !== false}
        />
        {state.showHelpDebug && (
          <HelpDebugOverlay defPos={frame.defPos} />
        )}
        {state.showScreenIndicators !== false && (
          <ScreenIndicator
            screen={frame.screen}
            off={frame.off}
            rule={(() => {
              if (!frame.screen) return state.screenRule;
              const nav = state.rules[frame.screen.carrierDef]?.screenNav;
              return nav && nav !== 'auto' ? nav : state.screenRule;
            })()}
          />
        )}
        {state.showScreenIndicators !== false && state.showOffBallScreenIndicator !== false && (
          <OffBallScreenIndicator screens={frame.offBallScreens} off={frame.off} />
        )}
        {state.showActionOrder && !props.isPlaying && props.scrubT == null && state.steps[state.activeStep] && (
          <ActionOrderBadges step={state.steps[state.activeStep]} />
        )}
        <Ball pos={frame.ballPos} inFlight={frame.ballInFlight} />
        {threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="badges" />}
      </svg>
      {props.isPlaying && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            background: 'rgba(30, 64, 175, 0.92)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>▶</span>
          <span>
            étape {frame.stepIdx + 1} / {state.steps.length}
            {state.steps[frame.stepIdx]?.label ? ` — ${state.steps[frame.stepIdx].label}` : ''}
          </span>
        </div>
      )}
      {ctxMenu?.kind === 'defender' && (
        <ContextMenu
          kind="defender"
          dId={ctxMenu.dId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          rule={state.rules[ctxMenu.dId]}
          hasOverride={!!state.steps[state.activeStep]?.defenseOverrides?.[ctxMenu.dId]}
          tool={state.tool}
          onSetTool={props.onSetTool}
          onUpdate={(p) => props.onUpdateRule(ctxMenu.dId, p)}
          onApplyProfile={(profile) => props.onApplyDefenderProfile(ctxMenu.dId, profile)}
          onClearOverride={() => props.onClearDefenseOverride(ctxMenu.dId)}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {ctxMenu?.kind === 'attacker' && (() => {
        const oId = ctxMenu.oId;
        const cur = state.steps[state.activeStep];
        return (
          <ContextMenu
            kind="attacker"
            oId={oId}
            x={ctxMenu.x}
            y={ctxMenu.y}
            isCarrier={cur?.ballCarrier === oId}
            isForcedScreener={cur?.forcedScreener === oId}
            hasAnnotations={(cur?.annotations ?? []).some((a) => a.fromId === oId)}
            dominantHand={state.attackerHands?.[oId] ?? 'right'}
            offensiveProfile={state.attackerProfiles?.[oId] ?? 'creator'}
            tool={state.tool}
            onSetTool={props.onSetTool}
            onMakeCarrier={() => props.onSetBallCarrier(oId)}
            onForceScreener={() => props.onSetForcedScreener(oId)}
            onClearForcedScreener={() => props.onSetForcedScreener(null)}
            onClearAnnotations={() => props.onClearAnnotationsFor(oId)}
            onSetDominantHand={(h) => props.onSetAttackerHand(oId, h)}
            onSetOffensiveProfile={(p) => props.onSetAttackerProfile(oId, p)}
            onClose={() => setCtxMenu(null)}
          />
        );
      })()}
      {zoneRegionMenu && state.defenseSystem === 'zone' && state.zoneEditMode && (() => {
        const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
        const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
        const layout = applyZoneOverrides(oriented, state.zoneOverrides);
        const region = layout.find((r) => r.id === zoneRegionMenu.regionId);
        if (!region) return null;
        return (
          <ZoneRegionMenu
            region={region}
            x={zoneRegionMenu.x}
            y={zoneRegionMenu.y}
            onUpdate={(patch) => props.onSetZoneOverride(zoneRegionMenu.regionId, patch)}
            onReset={() => props.onClearZoneOverride(zoneRegionMenu.regionId)}
            onClose={() => setZoneRegionMenu(null)}
          />
        );
      })()}
    </div>
  );
}

function extractDefPositions(defPos: ComputedDefense): Record<DefenderId, Point> {
  return {
    D1: { x: defPos.D1.x, y: defPos.D1.y },
    D2: { x: defPos.D2.x, y: defPos.D2.y },
    D3: { x: defPos.D3.x, y: defPos.D3.y },
    D4: { x: defPos.D4.x, y: defPos.D4.y },
    D5: { x: defPos.D5.x, y: defPos.D5.y },
  };
}

/**
 * Affiche en transparence les positions de tous les joueurs à l'étape donnée
 * (utilisé pour le mode fantôme : ghost de l'étape N-1 quand on édite N).
 * Cercles gris avec contour pointillé, sans label, opacité 0.35.
 */
function GhostLayer({ state, stepIdx }: { state: AppState; stepIdx: number }) {
  const step = state.steps[stepIdx];
  if (!step) return null;
  const defPos = effectiveDefensePositions(state, stepIdx);
  const r = PLAYER_RADIUS;
  return (
    <g pointerEvents="none" opacity={0.35}>
      {(Object.entries(step.off) as [AttackerId, Point][]).map(([id, pos]) => (
        <circle
          key={`ghost-o-${id}`}
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill="none"
          stroke="#D85A30"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      ))}
      {(Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p]) => (
        <circle
          key={`ghost-d-${id}`}
          cx={p.x}
          cy={p.y}
          r={r}
          fill="none"
          stroke="#378ADD"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      ))}
    </g>
  );
}
