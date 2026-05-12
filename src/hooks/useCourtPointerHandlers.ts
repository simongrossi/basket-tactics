// Hook qui regroupe toute la logique pointer de CourtView :
//
//  - drag d'un joueur (rAF-coalesced pour éviter le over-render à 120 Hz)
//  - création d'une annotation (rectiligne ou freehand via Shift)
//  - flush + commit à pointerUp + cleanup raf au unmount
//
// Le hook s'occupe uniquement de la coordination ; les callbacks "métier"
// (onAddAnnotation, onMoveAttacker, etc.) viennent du parent.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppState,
  Annotation,
  AttackerId,
  DefenderId,
  PlayerId,
  Point,
  Tool,
} from '@/lib/types';
import { COURT, FULL_COURT_INNER_MAX_Y, PLAYER_PICK_RADIUS_PX } from '@/lib/data/court';
import { clamp, distance } from '@/lib/logic/geometry';
import { activeOffense, getActiveDefenderIds } from '@/lib/logic/players';
import { simplifyPolyline } from '@/lib/logic/polyline';
import { snapToGrid, type SnapTarget } from '@/lib/logic/snapToGrid';
import { HOOP, HOOP_OPPOSITE } from '@/lib/data/court';

export interface PendingAnnotation {
  type: Tool;
  fromId: AttackerId;
  from: Point;
  to: Point;
  toId?: AttackerId | null;
  /** Buffer brut du tracé freehand (Shift+drag), ~1 point par pointermove.
   *  Simplifié à la fin du drag pour produire `waypoints`. */
  freehandPath?: Point[];
  /** Waypoints simplifiés affichés en preview pendant le drag (mis à jour
   *  toutes les 40 ms environ pour suivre la souris sans saturer le DOM). */
  waypoints?: Point[];
}

interface UseCourtPointerHandlersOptions {
  state: AppState;
  svgRef: React.RefObject<SVGSVGElement | null>;
  isPlaying: boolean;
  onBeginPlayerDrag?: () => void;
  onCommitPlayerDrag?: () => void;
  onMoveAttacker: (id: AttackerId, x: number, y: number) => void;
  onMoveDefender: (id: DefenderId, x: number, y: number) => void;
  onMoveAttackerDuringDrag?: (id: AttackerId, x: number, y: number) => void;
  onMoveDefenderDuringDrag?: (id: DefenderId, x: number, y: number) => void;
  onAddAnnotation: (a: Annotation) => void;
  /** Fermeture du context menu sur n'importe quel pointerDown gauche. */
  onClearContextMenu: () => void;
}

export interface UseCourtPointerHandlersResult {
  pending: PendingAnnotation | null;
  dragging: { id: PlayerId; isDef: boolean } | null;
  /** Cible de snap active pendant le drag courant (Ctrl/Cmd enfoncé). Null
   *  si pas de snap. Utilisé par CourtView pour afficher un visuel de
   *  feedback (highlight de la ligne sur laquelle on s'aimante). */
  snapTarget: SnapTarget | null;
  /** Helper pour convertir un événement clavier/souris en point SVG.
   *  Exposé pour permettre au caller de l'utiliser dans d'autres handlers
   *  (ex. context menu). */
  svgPoint: (evt: React.PointerEvent | PointerEvent | React.MouseEvent) => Point;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

export function useCourtPointerHandlers(
  opts: UseCourtPointerHandlersOptions
): UseCourtPointerHandlersResult {
  const {
    state,
    svgRef,
    isPlaying,
    onBeginPlayerDrag,
    onCommitPlayerDrag,
    onMoveAttacker,
    onMoveDefender,
    onMoveAttackerDuringDrag,
    onMoveDefenderDuringDrag,
    onAddAnnotation,
    onClearContextMenu,
  } = opts;

  const [dragging, setDragging] = useState<{ id: PlayerId; isDef: boolean } | null>(null);
  const dragMoveRef = useRef<{ id: PlayerId; isDef: boolean; x: number; y: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  const [snapTarget, setSnapTarget] = useState<SnapTarget | null>(null);

  const svgPoint = useCallback(
    (evt: React.PointerEvent | PointerEvent | React.MouseEvent): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    },
    [svgRef]
  );

  const findPlayerAt = useCallback(
    (pt: Point): PlayerId | null => {
      const cur = state.steps[state.activeStep];
      const off = activeOffense(cur.off, state.playerCount);
      for (const id in off) {
        if (distance(off[id as AttackerId], pt) < PLAYER_PICK_RADIUS_PX) return id as AttackerId;
      }
      const activeDefenders = new Set(getActiveDefenderIds(state.playerCount));
      for (const id in state.defenseInitial) {
        if (!activeDefenders.has(id as DefenderId)) continue;
        if (distance(state.defenseInitial[id as DefenderId], pt) < PLAYER_PICK_RADIUS_PX)
          return id as DefenderId;
      }
      return null;
    },
    [state]
  );

  /** rAF-coalesce : on enregistre la dernière position du drag dans
   *  `dragMoveRef` et on l'applique au prochain frame. Évite de pousser
   *  20+ updates React par mouvement souris (latence + jitter). */
  const queueDragMove = useCallback(
    (id: PlayerId, isDef: boolean, x: number, y: number) => {
      dragMoveRef.current = { id, isDef, x, y };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        const move = dragMoveRef.current;
        dragMoveRef.current = null;
        if (!move) return;
        const last = lastDragPointRef.current;
        if (last && last.x === move.x && last.y === move.y) return;
        lastDragPointRef.current = { x: move.x, y: move.y };
        if (move.isDef) {
          (onMoveDefenderDuringDrag ?? onMoveDefender)(move.id as DefenderId, move.x, move.y);
        } else {
          (onMoveAttackerDuringDrag ?? onMoveAttacker)(move.id as AttackerId, move.x, move.y);
        }
      });
    },
    [onMoveAttacker, onMoveAttackerDuringDrag, onMoveDefender, onMoveDefenderDuringDrag]
  );

  const flushDragMove = useCallback(() => {
    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const move = dragMoveRef.current;
    dragMoveRef.current = null;
    if (!move) return;
    const last = lastDragPointRef.current;
    if (last && last.x === move.x && last.y === move.y) return;
    lastDragPointRef.current = { x: move.x, y: move.y };
    if (move.isDef) {
      (onMoveDefenderDuringDrag ?? onMoveDefender)(move.id as DefenderId, move.x, move.y);
    } else {
      (onMoveAttackerDuringDrag ?? onMoveAttacker)(move.id as AttackerId, move.x, move.y);
    }
  }, [onMoveAttacker, onMoveAttackerDuringDrag, onMoveDefender, onMoveDefenderDuringDrag]);

  // Cleanup raf au unmount pour éviter le warning "setState on unmounted".
  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return;
      onClearContextMenu();
      if (isPlaying) return;
      const target = (e.target as Element).closest('g[data-id]');
      const pt = svgPoint(e);

      if (state.tool === 'move') {
        if (!target) return;
        const id = target.getAttribute('data-id') as PlayerId;
        onBeginPlayerDrag?.();
        lastDragPointRef.current = null;
        dragMoveRef.current = null;
        setDragging({ id, isDef: id.startsWith('D') });
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      const fromId = (target?.getAttribute('data-id') as PlayerId | null) ?? findPlayerAt(pt);
      if (!fromId || !fromId.startsWith('O')) return;
      const from = { ...state.steps[state.activeStep].off[fromId as AttackerId] };
      // Shift+drag = tracé freehand : on enregistre la trajectoire de la souris
      // pour produire une annotation avec waypoints (V-cut, L-cut, courbe libre).
      // Pas applicable à `pass` (la passe reste rectiligne par convention).
      const freehand = e.shiftKey && state.tool !== 'pass';
      setPending({
        type: state.tool,
        fromId: fromId as AttackerId,
        from,
        to: pt,
        freehandPath: freehand ? [from] : undefined,
      });
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [findPlayerAt, isPlaying, onBeginPlayerDrag, onClearContextMenu, state, svgPoint, svgRef]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pt = svgPoint(e);
      if (dragging && state.tool === 'move') {
        const maxY = state.fullCourt ? FULL_COURT_INNER_MAX_Y : COURT.innerMaxY;
        let x = clamp(pt.x, COURT.marginX, COURT.innerMaxX);
        let y = clamp(pt.y, COURT.marginY, maxY);
        // #2 — Snap-to-grid : si Ctrl (PC) ou Cmd (Mac) est enfoncé pendant
        // le drag, magnétiser aux lignes clés du terrain (3pts, raquette,
        // blocs bas, ligne médiane). Visuel de feedback via snapTarget.
        if (e.ctrlKey || e.metaKey) {
          const hoop = state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
          const snap = snapToGrid({ x, y }, 8, hoop);
          x = snap.point.x;
          y = snap.point.y;
          setSnapTarget(snap.snappedTo);
        } else if (snapTarget !== null) {
          setSnapTarget(null);
        }
        queueDragMove(dragging.id, dragging.isDef, Math.round(x), Math.round(y));
        return;
      }
      if (pending) {
        const target = (e.target as Element).closest('g[data-id]');
        const overId = (target?.getAttribute('data-id') as PlayerId | null) ?? findPlayerAt(pt);
        const toId = overId && overId.startsWith('O') ? (overId as AttackerId) : null;
        if (pending.freehandPath) {
          // Mode freehand : on échantillonne tous les ~6 px pour ne pas saturer
          // le buffer (un drag long peut générer des centaines de points sinon).
          const last = pending.freehandPath[pending.freehandPath.length - 1];
          const sampled = distance(last, pt) >= 6
            ? [...pending.freehandPath, pt]
            : pending.freehandPath;
          // Waypoints affichés en preview = polyline simplifiée intermédiaire
          // (sans `from`/`to` finaux). Tolérance 5 px : équilibre lisibilité /
          // fidélité au geste.
          const simplified = simplifyPolyline([...sampled, pt], 5);
          const waypoints = simplified.slice(1, -1);
          setPending({ ...pending, to: pt, toId, freehandPath: sampled, waypoints });
        } else {
          setPending({ ...pending, to: pt, toId });
        }
      }
    },
    [dragging, findPlayerAt, pending, queueDragMove, snapTarget, state.attackingDirection, state.fullCourt, state.tool, svgPoint]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragging) {
        const pt = svgPoint(e);
        const maxY = state.fullCourt ? FULL_COURT_INNER_MAX_Y : COURT.innerMaxY;
        let x = clamp(pt.x, COURT.marginX, COURT.innerMaxX);
        let y = clamp(pt.y, COURT.marginY, maxY);
        // Snap final au release si Ctrl/Cmd encore enfoncé.
        if (e.ctrlKey || e.metaKey) {
          const hoop = state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
          const snap = snapToGrid({ x, y }, 8, hoop);
          x = snap.point.x;
          y = snap.point.y;
        }
        setSnapTarget(null); // cleanup feedback visuel
        queueDragMove(dragging.id, dragging.isDef, Math.round(x), Math.round(y));
        flushDragMove();
        onCommitPlayerDrag?.();
        setDragging(null);
        return;
      }
      if (pending) {
        const d = distance(pending.from, pending.to);
        if (d < 15) {
          setPending(null);
          return;
        }
        // Si freehand : simplifier le buffer brut → waypoints finaux.
        // Tolérance 6 px = courbes franches préservées, micro-tremblements
        // souris ignorés.
        let waypoints: Point[] | undefined;
        if (pending.freehandPath && pending.freehandPath.length > 2) {
          const fullPath = [...pending.freehandPath, pending.to];
          const simplified = simplifyPolyline(fullPath, 6);
          const inner = simplified.slice(1, -1);
          if (inner.length > 0) waypoints = inner;
        }
        onAddAnnotation({
          type: pending.type as Annotation['type'],
          fromId: pending.fromId,
          toId: pending.toId ?? null,
          from: pending.from,
          to: pending.to,
          ...(waypoints ? { waypoints } : {}),
        });
        setPending(null);
      }
    },
    [
      dragging,
      flushDragMove,
      onAddAnnotation,
      onCommitPlayerDrag,
      pending,
      queueDragMove,
      state.fullCourt,
      svgPoint,
    ]
  );

  return { pending, dragging, snapTarget, svgPoint, onPointerDown, onPointerMove, onPointerUp };
}
