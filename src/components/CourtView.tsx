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
import { effectiveDefensePositions, getMatchupsAt } from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import type { DetectedOffBallScreen } from '@/lib/types';
import { detectTriggers } from '@/lib/logic/triggers';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import { COURT, PLAYER_RADIUS, FULL_COURT_HEIGHT, FULL_COURT_INNER_MAX_Y } from '@/lib/data/court';
import { clamp, distance, curveAroundObstacle, resolvePlayerCollisions, makeCluster, pickBlockingCluster, computeBallFrame } from '@/lib/logic/geometry';
import { ContextMenu } from './ContextMenu';

interface CourtViewProps {
  state: AppState;
  onMoveAttacker: (id: AttackerId, x: number, y: number) => void;
  onMoveDefender: (id: DefenderId, x: number, y: number) => void;
  onAddAnnotation: (a: Annotation) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onClearDefenseOverride: (dId: DefenderId) => void;
  onSetBallCarrier: (oId: AttackerId) => void;
  onSetForcedScreener: (oId: AttackerId | null) => void;
  onClearAnnotationsFor: (oId: AttackerId) => void;
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
}

export function CourtView(props: CourtViewProps) {
  const { state } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ id: PlayerId; isDef: boolean } | null>(null);
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  type CtxMenuState =
    | { kind: 'defender'; dId: DefenderId; x: number; y: number }
    | { kind: 'attacker'; oId: AttackerId; x: number; y: number };
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
      const off = {} as AttackerPositions;
      (Object.keys(a.off) as AttackerId[]).forEach((id) => {
        off[id] = {
          x: a.off[id].x + (b.off[id].x - a.off[id].x) * localT,
          y: a.off[id].y + (b.off[id].y - a.off[id].y) * localT,
        };
      });
      const defA = effectiveDefensePositions(cur, idxA);
      const defB = effectiveDefensePositions(cur, idxB);

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
        // Staggered screens : plusieurs poseurs sur le chemin → on contourne
        // celui qui est LE PLUS BLOQUANT (pénétration dans le segment la plus
        // profonde), pas le premier de la liste.
        const candidates = screenerObstacles.filter((o) => id !== o.defenderToSkip);
        const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
        if (blocking) {
          p = curveAroundObstacle(defA[id], defB[id], blocking.center, blocking.radius, localT);
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
      setPlayFrame({ off, defPos, carrier, screen, offBallScreens, stepIdx: idxA, ballPos: ball.pos, ballInFlight: ball.inFlight });
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
    const off = {} as AttackerPositions;
    (Object.keys(a.off) as AttackerId[]).forEach((id) => {
      off[id] = {
        x: a.off[id].x + (b.off[id].x - a.off[id].x) * localT,
        y: a.off[id].y + (b.off[id].y - a.off[id].y) * localT,
      };
    });
    const defA = effectiveDefensePositions(state, idxA);
    const defB = effectiveDefensePositions(state, idxB);
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
      const blocking = pickBlockingCluster(defA[id], defB[id], candidates);
      if (blocking) {
        p = curveAroundObstacle(defA[id], defB[id], blocking.center, blocking.radius, localT);
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
    };
  }, [props.scrubT, state]);

  const frame = playFrame ?? scrubFrame ?? staticFrame;

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
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
        <CourtBackground fullCourt={state.fullCourt} />
        {state.defenseSystem === 'zone' && (() => {
          const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
          const zoneLayout = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
          return <ZoneOverlay layout={zoneLayout} show />;
        })()}
        {state.defenseSystem === 'zone' ? (() => {
          const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
          const zoneLayout = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
          return (
            <ZoneCoverage
              off={frame.off}
              defPos={frame.defPos}
              layout={zoneLayout}
              show={state.showMatchups}
            />
          );
        })() : (
          <Matchups off={frame.off} defPos={frame.defPos} show={state.showMatchups} />
        )}
        <HelpLines off={frame.off} defPos={frame.defPos} defenseDistance={state.defenseDistance} show={state.showHelpLines} />
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
                      facing={frame.off[p.matchedTo]}
                      isOverridden={!!state.steps[state.activeStep]?.defenseOverrides?.[id]}
                      closingOut={p.closingOut}
                      overClosed={p.overClosed}
                      denying={p.denying}
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
                    />
                  ) : null
                )}
              </>
            );
          })()}
        </g>
        <g>
          {state.steps[frame.stepIdx]?.annotations.map((a, i) => (
            <AnnotationView key={i} annotation={a} />
          ))}
          {pending && pending.from && <AnnotationView annotation={pending as Annotation} preview />}
        </g>
        <PassLanesOverlay
          off={frame.off}
          defPos={frame.defPos}
          carrier={frame.carrier}
          show={state.showPassLanes}
        />
        <ScreenIndicator
          screen={frame.screen}
          off={frame.off}
          rule={(() => {
            if (!frame.screen) return state.screenRule;
            const nav = state.rules[frame.screen.carrierDef]?.screenNav;
            return nav && nav !== 'auto' ? nav : state.screenRule;
          })()}
        />
        <OffBallScreenIndicator screens={frame.offBallScreens} off={frame.off} />
        <Ball pos={frame.ballPos} inFlight={frame.ballInFlight} />
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
          onUpdate={(p) => props.onUpdateRule(ctxMenu.dId, p)}
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
            onMakeCarrier={() => props.onSetBallCarrier(oId)}
            onForceScreener={() => props.onSetForcedScreener(oId)}
            onClearForcedScreener={() => props.onSetForcedScreener(null)}
            onClearAnnotations={() => props.onClearAnnotationsFor(oId)}
            onClose={() => setCtxMenu(null)}
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
