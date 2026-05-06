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
import { effectiveDefensePositions, getMatchupsAt } from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import type { DetectedOffBallScreen } from '@/lib/types';
import { detectTriggers } from '@/lib/logic/triggers';
import { getZoneLayout } from '@/lib/data/zones';
import { COURT, PLAYER_RADIUS, FULL_COURT_HEIGHT, FULL_COURT_INNER_MAX_Y } from '@/lib/data/court';
import { clamp, distance } from '@/lib/logic/geometry';
import { ContextMenu } from './ContextMenu';

interface CourtViewProps {
  state: AppState;
  onMoveAttacker: (id: AttackerId, x: number, y: number) => void;
  onMoveDefender: (id: DefenderId, x: number, y: number) => void;
  onAddAnnotation: (a: Annotation) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onSetTool: (t: Tool) => void;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlaybackEnd?: () => void;
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
}

export function CourtView(props: CourtViewProps) {
  const { state } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ id: PlayerId; isDef: boolean } | null>(null);
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ dId: DefenderId; x: number; y: number } | null>(null);
  const [playFrame, setPlayFrame] = useState<PlaybackFrame | null>(null);

  // Playback animation
  const playStart = useRef(0);
  useEffect(() => {
    if (!props.isPlaying) {
      setPlayFrame(null);
      return;
    }
    playStart.current = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - playStart.current;
      const stepDuration = 1500 / props.playbackSpeed;
      const totalSteps = state.steps.length - 1;
      if (totalSteps <= 0) return;
      const globalT = elapsed / stepDuration;
      if (globalT >= totalSteps) {
        setPlayFrame(null);
        props.onPlaybackEnd?.();
        return;
      }
      const idxA = Math.floor(globalT);
      const idxB = idxA + 1;
      const localT = globalT - idxA;
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
      const defPos = {} as ComputedDefense;
      (Object.keys(defA) as DefenderId[]).forEach((id) => {
        defPos[id] = {
          x: defA[id].x + (defB[id].x - defA[id].x) * localT,
          y: defA[id].y + (defB[id].y - defA[id].y) * localT,
          late: defB[id].late,
          helpFactor: defB[id].helpFactor,
          isCarrierDefender: defB[id].isCarrierDefender,
          matchedTo: defB[id].matchedTo,
          onScreen: defB[id].onScreen,
          switchedThisStep: defB[id].switchedThisStep,
        };
      });
      const carrier = localT < 0.5 ? a.ballCarrier : b.ballCarrier;
      let screen: ReturnType<typeof detectScreen> = null;
      let offBallScreens: DetectedOffBallScreen[] = [];
      if (state.defenseSystem === 'man') {
        const matchups = getMatchupsAt(state.steps, idxB - 1);
        const defPosExtracted = extractDefPositions(defPos);
        screen = detectScreen(off, carrier, matchups, defPosExtracted, state.screenRadius);
        offBallScreens = detectOffBallScreens(off, carrier, matchups, defPosExtracted, state.screenRadius);
      }
      setPlayFrame({ off, defPos, carrier, screen, offBallScreens, stepIdx: idxA });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [props.isPlaying, props.playbackSpeed, state]);

  // Computed (static frame)
  const staticFrame = useMemo<PlaybackFrame>(() => {
    const cur = state.steps[state.activeStep];
    const defPos = effectiveDefensePositions(state, state.activeStep);
    let screen: ReturnType<typeof detectScreen> = null;
    let offBallScreens: DetectedOffBallScreen[] = [];
    if (state.defenseSystem === 'man') {
      const matchups = getMatchupsAt(state.steps, state.activeStep - 1);
      const defPosExtracted = extractDefPositions(defPos);
      screen = detectScreen(cur.off, cur.ballCarrier, matchups, defPosExtracted, state.screenRadius);
      offBallScreens = detectOffBallScreens(cur.off, cur.ballCarrier, matchups, defPosExtracted, state.screenRadius);
    }
    return { off: cur.off, defPos, carrier: cur.ballCarrier, screen, offBallScreens, stepIdx: state.activeStep };
  }, [state]);

  const frame = playFrame ?? staticFrame;

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
    if (!target) return;
    const id = target.getAttribute('data-id');
    if (!id || !id.startsWith('D')) return;
    e.preventDefault();
    const wrap = svgRef.current?.parentElement?.getBoundingClientRect();
    if (!wrap) return;
    setCtxMenu({ dId: id as DefenderId, x: e.clientX - wrap.left, y: e.clientY - wrap.top });
  };

  return (
    <div style={{ position: 'relative', background: '#f5f5f4', borderRadius: 12, padding: 6 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${COURT.width} ${state.fullCourt ? FULL_COURT_HEIGHT : COURT.height}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <ArrowMarkers />
        <CourtBackground fullCourt={state.fullCourt} />
        {state.defenseSystem === 'zone' && (
          <ZoneOverlay layout={getZoneLayout(state.zoneConfig.type)} show />
        )}
        <Matchups off={frame.off} defPos={frame.defPos} show={state.showMatchups} />
        <ScreenIndicator screen={frame.screen} off={frame.off} rule={state.screenRule} />
        <OffBallScreenIndicator screens={frame.offBallScreens} off={frame.off} />
        <HelpLines off={frame.off} defPos={frame.defPos} defenseDistance={state.defenseDistance} show={state.showHelpLines} />
        <g>
          {state.steps[frame.stepIdx]?.annotations.map((a, i) => (
            <AnnotationView key={i} annotation={a} />
          ))}
          {pending && pending.from && <AnnotationView annotation={pending as Annotation} preview />}
        </g>
        <g>
          {(() => {
            const screenerIds = new Set<AttackerId>();
            if (frame.screen?.screener) screenerIds.add(frame.screen.screener);
            frame.offBallScreens.forEach((s) => screenerIds.add(s.screener));
            return (
              <>
                {(Object.entries(frame.off) as [AttackerId, Point][])
                  .filter(([id]) => !screenerIds.has(id))
                  .map(([id, pos]) => (
                    <Player key={id} id={id} pos={pos} isAttacker />
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
                    />
                  )
                )}
                {Array.from(screenerIds).map((id) =>
                  frame.off[id] ? (
                    <Player key={`screener-${id}`} id={id} pos={frame.off[id]} isAttacker />
                  ) : null
                )}
              </>
            );
          })()}
        </g>
        <Ball carrierPos={frame.off[frame.carrier]} />
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
      {ctxMenu && (
        <ContextMenu
          dId={ctxMenu.dId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          rule={state.rules[ctxMenu.dId]}
          onUpdate={(p) => props.onUpdateRule(ctxMenu.dId, p)}
          onClose={() => setCtxMenu(null)}
        />
      )}
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
