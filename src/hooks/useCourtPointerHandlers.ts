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
  AddAnnotationOptions,
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
import { generateAutoAnnotation } from '@/lib/logic/autoActions/generateAutoAnnotation';
import { hitTestTextNote } from '@/components/court/textNoteGeometry';

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
  isPlayerMode?: boolean;
  onBeginPlayerDrag?: () => void;
  onCommitPlayerDrag?: () => void;
  /** Poursuite défenseur (opt-in) — début : capture les positions défenseurs
   *  et active le rAF loop dans useCourtFrame. À appeler au démarrage d'un
   *  drag attaquant. */
  onBeginDefenderPursuit?: () => void;
  /** Poursuite défenseur — fin : désactive le rAF loop. À appeler au commit
   *  du drag attaquant. */
  onEndDefenderPursuit?: () => void;
  onMoveAttacker: (id: AttackerId, x: number, y: number) => void;
  onMoveDefender: (id: DefenderId, x: number, y: number) => void;
  onMoveAttackerDuringDrag?: (id: AttackerId, x: number, y: number) => void;
  onMoveDefenderDuringDrag?: (id: DefenderId, x: number, y: number) => void;
  onAddAnnotation: (a: Annotation, options?: AddAnnotationOptions) => void;
  annotationFullT?: number | null;
  frameOff?: Partial<Record<AttackerId, Point>>;
  frameDefPos?: Partial<Record<DefenderId, Point>>;
  /** Fermeture du context menu sur n'importe quel pointerDown gauche. */
  onClearContextMenu: () => void;
  // ----- #4 Sélection multiple -----
  /** IDs défenseurs actuellement sélectionnés (visuel + drag groupé). */
  selectedDefenders?: Set<DefenderId>;
  /** Toggle d'un défenseur via Shift+clic. */
  onToggleDefenderSelection?: (dId: DefenderId) => void;
  /** Remplace la sélection (utilisé par le marquee). */
  onSetDefenderSelection?: (ids: DefenderId[]) => void;
  /** Clear total de la sélection (clic dans le vide sans modifier). */
  onClearDefenderSelection?: () => void;
  /** A.3 — Notes texte de l'étape courante (pour hit-test au clic). */
  textNotes?: import('@/lib/types').TextNote[];
  /** A.3 — Appelé quand l'utilisateur clique sur le terrain avec l'outil
   *  `text` actif. `noteIdx === null` → création ; sinon édition de la
   *  note d'index donné. */
  onTextToolClick?: (payload: {
    courtPos: { x: number; y: number };
    screenPos: { x: number; y: number };
    noteIdx: number | null;
  }) => void;
  onOpenContextMenu?: (id: PlayerId, clientX: number, clientY: number) => void;
  transform: { scale: number; x: number; y: number };
  onTransformChange: (t: { scale: number; x: number; y: number }) => void;
  spacePressed?: boolean;
  contentRef: React.RefObject<SVGGElement | null>;
}

export interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface UseCourtPointerHandlersResult {
  pending: PendingAnnotation | null;
  dragging: { id: PlayerId; isDef: boolean } | null;
  /** Cible de snap active pendant le drag courant (Ctrl/Cmd enfoncé). Null
   *  si pas de snap. Utilisé par CourtView pour afficher un visuel de
   *  feedback (highlight de la ligne sur laquelle on s'aimante). */
  snapTarget: SnapTarget | null;
  /** Rectangle du marquee en cours (Shift+drag dans le vide). Null si pas
   *  de marquee actif. CourtView l'affiche en SVG semi-transparent. */
  marquee: MarqueeRect | null;
  /** ID de la source d'une action auto en attente (clic simple sur un attaquant
   *  en mode `tool === 'pass'`). Le clic suivant sur un attaquant déclenchera
   *  la création auto. CourtView l'utilise pour afficher un halo sur le joueur
   *  source. Null si pas en attente. */
  pendingAutoSourceId: AttackerId | null;
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
    isPlayerMode = false,
    onBeginPlayerDrag,
    onCommitPlayerDrag,
    onBeginDefenderPursuit,
    onEndDefenderPursuit,
    onMoveAttacker,
    onMoveDefender,
    onMoveAttackerDuringDrag,
    onMoveDefenderDuringDrag,
    onAddAnnotation,
    annotationFullT,
    frameOff,
    frameDefPos,
    onClearContextMenu,
    selectedDefenders,
    onToggleDefenderSelection,
    onSetDefenderSelection,
    onClearDefenderSelection,
    textNotes,
    onTextToolClick,
    onOpenContextMenu,
    transform,
    onTransformChange,
    spacePressed,
    contentRef,
  } = opts;

  const [dragging, setDragging] = useState<{ id: PlayerId; isDef: boolean } | null>(null);
  const dragMoveRef = useRef<{ id: PlayerId; isDef: boolean; x: number; y: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const lastDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  const [snapTarget, setSnapTarget] = useState<SnapTarget | null>(null);
  /** Source d'une passe auto (clic-simple en mode `tool === 'pass'`). On garde
   *  le fromId, et au pointer down suivant sur un attaquant on génère
   *  l'annotation via generateAutoAnnotation. */
  const [pendingAutoSourceId, setPendingAutoSourceId] = useState<AttackerId | null>(null);

  // Escape annule le mode auto en attente (pas de side-effect dans le DOM).
  useEffect(() => {
    if (!pendingAutoSourceId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingAutoSourceId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingAutoSourceId]);

  // Si le tool change, on sort du mode auto-pending (cohérence UX).
  useEffect(() => {
    if (state.tool !== 'pass' && pendingAutoSourceId) {
      setPendingAutoSourceId(null);
    }
  }, [state.tool, pendingAutoSourceId]);

  // #4 — Marquee + drag groupé.
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeStartRef = useRef<Point | null>(null);
  /** Positions initiales des défenseurs sélectionnés au début d'un drag
   *  groupé. Utilisé pour calculer le delta à appliquer. */
  const groupDragInitialRef = useRef<{
    anchorId: DefenderId;
    initial: Point;
    others: Map<DefenderId, Point>;
  } | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const activePointersRef = useRef<Map<number, Point>>(new Map());
  const lastGestureRef = useRef<{ distance: number; midpoint: Point } | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; transformX: number; transformY: number } | null>(null);

  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const svgPoint = useCallback(
    (evt: React.PointerEvent | PointerEvent | React.MouseEvent): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const el = contentRef.current ?? svg;
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const getCTM = () => {
        if (typeof el.getScreenCTM === 'function') return el.getScreenCTM();
        if (typeof svg.getScreenCTM === 'function') return svg.getScreenCTM();
        return null;
      };
      const ctm = getCTM();
      if (!ctm) return { x: 0, y: 0 };
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    },
    [svgRef, contentRef]
  );

  const findPlayerAt = useCallback(
    (pt: Point): PlayerId | null => {
      const cur = state.steps[state.activeStep];
      const off = frameOff ?? activeOffense(cur.off, state.playerCount);
      for (const id in off) {
        const pos = off[id as AttackerId];
        if (pos && distance(pos, pt) < PLAYER_PICK_RADIUS_PX) return id as AttackerId;
      }
      const activeDefenders = new Set(getActiveDefenderIds(state.playerCount));
      const defPositions = frameDefPos ?? state.defenseInitial;
      for (const id in defPositions) {
        if (!activeDefenders.has(id as DefenderId)) continue;
        const pos = defPositions[id as DefenderId];
        if (pos && distance(pos, pt) < PLAYER_PICK_RADIUS_PX)
          return id as DefenderId;
      }
      return null;
    },
    [frameDefPos, frameOff, state]
  );

  /** rAF-coalesce : on enregistre la dernière position du drag dans
   *  `dragMoveRef` et on l'applique au prochain frame. Évite de pousser
   *  20+ updates React par mouvement souris (latence + jitter). */
  const queueDragMove = useCallback(
    (id: PlayerId, isDef: boolean, x: number, y: number) => {
      dragMoveRef.current = { id, isDef, x, y };
      dragRafRef.current = requestAnimationFrame(() => {
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
      cancelAnimationFrame(dragRafRef.current);
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
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        lastGestureRef.current = { distance: d, midpoint: mid };
        setDragging(null);
        setPending(null);
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (dragRafRef.current !== null) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        return;
      }

      if (isPlayerMode) {
        // Player Mode: only panning, no drag/edit
        panStartRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          transformX: transformRef.current.x,
          transformY: transformRef.current.y,
        };
        svgRef.current?.setPointerCapture(e.pointerId);
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        return;
      }

      if (e.button === 2) return;
      onClearContextMenu();
      if (isPlaying) return;
      const target = (e.target as Element).closest('g[data-id]');
      const pt = svgPoint(e);
      const id = findPlayerAt(pt) ?? (target?.getAttribute('data-id') as PlayerId | null);

      const isPanTrigger =
        spacePressed ||
        e.button === 1 ||
        (state.tool === 'move' && !id && !e.shiftKey);

      if (isPanTrigger) {
        panStartRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          transformX: transformRef.current.x,
          transformY: transformRef.current.y,
        };
        svgRef.current?.setPointerCapture(e.pointerId);
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        return;
      }

      if (e.button === 0 && id) {
        touchStartPosRef.current = { x: e.clientX, y: e.clientY };
        longPressTriggeredRef.current = false;
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressTriggeredRef.current = true;
          if (onOpenContextMenu) {
            onOpenContextMenu(id, e.clientX, e.clientY);
          }
          setDragging(null);
          setPending(null);
          if (dragRafRef.current !== null) {
            cancelAnimationFrame(dragRafRef.current);
            dragRafRef.current = null;
          }
        }, 600);
      }

      // A.3 — Outil 'note' : tout clic ouvre le popup (création si zone vide,
      // édition si on tape sur une note existante). Court-circuite les autres
      // chemins (drag joueur, tracé d'annotation).
      if (state.tool === 'text' && onTextToolClick) {
        const noteIdx = textNotes ? hitTestTextNote(pt, textNotes) : null;
        onTextToolClick({
          courtPos: pt,
          screenPos: { x: e.clientX, y: e.clientY },
          noteIdx,
        });
        return;
      }

      if (state.tool === 'move') {
        // Picking : priorise findPlayerAt(pt) qui retourne l'ATTAQUANT en
        // priorité quand un attaquant et un défenseur sont à portée du clic.
        // Évite le bug où le défenseur (rendu au-dessus dans le SVG) intercepte
        // le drag sur un attaquant superposé (sprite Prop A élargi). Fallback
        // sur le data-id du SVG si proximity-pick ne trouve rien.
        // (L'id a déjà été calculé plus haut dans ce handler)

        // #4 — Sélection multiple (mode move uniquement, ne conflicte pas
        // avec le Shift+freehand des autres tools).
        if (e.shiftKey) {
          // Shift+clic sur défenseur → toggle sélection, pas de drag.
          if (id && id.startsWith('D') && onToggleDefenderSelection) {
            onToggleDefenderSelection(id as DefenderId);
            return;
          }
          // Shift+clic dans le vide → start marquee.
          if (!id) {
            marqueeStartRef.current = pt;
            setMarquee({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
            svgRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }

        // Click dans le vide sans shift → clear sélection si existante.
        if (!id) {
          if (selectedDefenders && selectedDefenders.size > 0) {
            onClearDefenderSelection?.();
          }
          return;
        }

        // Click sur défenseur SÉLECTIONNÉ (sans shift) → drag groupé.
        if (
          id.startsWith('D') &&
          selectedDefenders &&
          selectedDefenders.has(id as DefenderId) &&
          selectedDefenders.size >= 2
        ) {
          // Capture des positions initiales pour calculer le delta.
          const stepDef = state.steps[state.activeStep]?.defenseOverrides;
          const others = new Map<DefenderId, Point>();
          selectedDefenders.forEach((dId) => {
            if (dId === id) return;
            const p = stepDef?.[dId] ?? state.defenseInitial[dId];
            if (p) others.set(dId, { x: p.x, y: p.y });
          });
          const anchorPos = stepDef?.[id as DefenderId] ?? state.defenseInitial[id as DefenderId];
          groupDragInitialRef.current = {
            anchorId: id as DefenderId,
            initial: { x: anchorPos.x, y: anchorPos.y },
            others,
          };
          onBeginPlayerDrag?.();
          lastDragPointRef.current = null;
          dragMoveRef.current = null;
          setDragging({ id, isDef: true });
          svgRef.current?.setPointerCapture(e.pointerId);
          return;
        }

        // Click sur joueur non sélectionné → drag single + clear sélection.
        if (selectedDefenders && selectedDefenders.size > 0) {
          onClearDefenderSelection?.();
        }
        if (!target) return;
        onBeginPlayerDrag?.();
        // Poursuite défenseur (opt-in) : si l'utilisateur drag un ATTAQUANT,
        // capturer les positions défenseurs et activer le rAF loop pursuit
        // (cap vitesse modulé, V1+V2+V3 dans useCourtFrame).
        if (!id!.startsWith('D')) {
          onBeginDefenderPursuit?.();
        }
        lastDragPointRef.current = null;
        dragMoveRef.current = null;
        setDragging({ id: id as PlayerId, isDef: id!.startsWith('D') });
        svgRef.current?.setPointerCapture(e.pointerId);
        return;
      }

      const fromId = (target?.getAttribute('data-id') as PlayerId | null) ?? findPlayerAt(pt);
      if (!fromId || !fromId.startsWith('O')) return;

      // Mode "auto-passe" 2 clics : si on a déjà une source en attente et que
      // tool === 'pass', le clic courant complète l'action — on génère
      // l'annotation auto et on sort, sans démarrer de drag. Si l'utilisateur
      // re-clique sur la source elle-même, on annule.
      if (state.tool === 'pass' && pendingAutoSourceId) {
        if (fromId === pendingAutoSourceId) {
          setPendingAutoSourceId(null);
          return;
        }
        const auto = generateAutoAnnotation(
          'pass',
          pendingAutoSourceId,
          fromId as AttackerId,
          undefined,
          state,
        );
        if (auto) onAddAnnotation(auto);
        setPendingAutoSourceId(null);
        return;
      }

      const frameFrom = frameOff?.[fromId as AttackerId];
      const from = frameFrom
        ? { ...frameFrom }
        : { ...state.steps[state.activeStep].off[fromId as AttackerId] };
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
    [findPlayerAt, frameOff, isPlaying, isPlayerMode, onAddAnnotation, onBeginPlayerDrag, onClearContextMenu, onClearDefenderSelection, onTextToolClick, onToggleDefenderSelection, pendingAutoSourceId, selectedDefenders, state, svgPoint, svgRef, textNotes]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (activePointersRef.current.size === 2 && lastGestureRef.current) {
        const pts = Array.from(activePointersRef.current.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        
        const prev = lastGestureRef.current;
        const zoomFactor = d / prev.distance;
        
        const nextScale = Math.max(0.5, Math.min(5, transformRef.current.scale * zoomFactor));
        const factor = nextScale / transformRef.current.scale;
        
        let nextX = mid.x - (mid.x - transformRef.current.x) * factor;
        let nextY = mid.y - (mid.y - transformRef.current.y) * factor;
        
        nextX += (mid.x - prev.midpoint.x);
        nextY += (mid.y - prev.midpoint.y);
        
        onTransformChange({
          scale: nextScale,
          x: nextX,
          y: nextY,
        });
        
        lastGestureRef.current = { distance: d, midpoint: mid };
        return;
      }

      if (panStartRef.current) {
        const start = panStartRef.current;
        const dx = e.clientX - start.clientX;
        const dy = e.clientY - start.clientY;
        onTransformChange({
          scale: transformRef.current.scale,
          x: start.transformX + dx,
          y: start.transformY + dy,
        });
        return;
      }

      if (touchStartPosRef.current && longPressTimerRef.current !== null) {
        const dx = e.clientX - touchStartPosRef.current.x;
        const dy = e.clientY - touchStartPosRef.current.y;
        if (Math.hypot(dx, dy) > 10) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      const pt = svgPoint(e);

      // #4 — Marquee en cours (Shift+drag dans le vide).
      if (marqueeStartRef.current) {
        const start = marqueeStartRef.current;
        setMarquee({
          x1: Math.min(start.x, pt.x),
          y1: Math.min(start.y, pt.y),
          x2: Math.max(start.x, pt.x),
          y2: Math.max(start.y, pt.y),
        });
        return;
      }

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
        // #4 — Si on est en drag groupé, applique le même delta aux autres
        // défenseurs sélectionnés AVANT le queue de l'ancre (sinon le delta
        // serait calculé après la mise à jour de l'ancre par queue).
        const group = groupDragInitialRef.current;
        if (group) {
          const dx = Math.round(x) - group.initial.x;
          const dy = Math.round(y) - group.initial.y;
          group.others.forEach((initPos, otherId) => {
            const nx = clamp(initPos.x + dx, COURT.marginX, COURT.innerMaxX);
            const ny = clamp(initPos.y + dy, COURT.marginY, maxY);
            (onMoveDefenderDuringDrag ?? onMoveDefender)(
              otherId,
              Math.round(nx),
              Math.round(ny)
            );
          });
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
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        lastGestureRef.current = null;
      }

      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (panStartRef.current) {
        panStartRef.current = null;
        svgRef.current?.releasePointerCapture(e.pointerId);
        return;
      }

      const wasLongPress = longPressTriggeredRef.current;
      longPressTriggeredRef.current = false;
      if (wasLongPress) {
        svgRef.current?.releasePointerCapture(e.pointerId);
        return;
      }

      // #4 — Finalisation du marquee.
      if (marqueeStartRef.current && marquee) {
        // Collecte les défenseurs dans le rectangle.
        const activeDefs = getActiveDefenderIds(state.playerCount);
        const stepDef = state.steps[state.activeStep]?.defenseOverrides;
        const inRect: DefenderId[] = [];
        for (const dId of activeDefs) {
          const p = stepDef?.[dId] ?? state.defenseInitial[dId];
          if (!p) continue;
          if (
            p.x >= marquee.x1 &&
            p.x <= marquee.x2 &&
            p.y >= marquee.y1 &&
            p.y <= marquee.y2
          ) {
            inRect.push(dId);
          }
        }
        onSetDefenderSelection?.(inRect);
        marqueeStartRef.current = null;
        setMarquee(null);
        return;
      }

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

        // #4 — Si group drag, applique le delta final aux autres via les
        // handlers `DuringDrag` (pas d'undo individuel). Le `commitPlayerDrag`
        // qui suit coalesce TOUT le drag (ancre + groupe) en une seule
        // entrée d'historique.
        const group = groupDragInitialRef.current;
        if (group) {
          const dx = Math.round(x) - group.initial.x;
          const dy = Math.round(y) - group.initial.y;
          group.others.forEach((initPos, otherId) => {
            const nx = clamp(initPos.x + dx, COURT.marginX, COURT.innerMaxX);
            const ny = clamp(initPos.y + dy, COURT.marginY, maxY);
            (onMoveDefenderDuringDrag ?? onMoveDefender)(
              otherId,
              Math.round(nx),
              Math.round(ny)
            );
          });
          groupDragInitialRef.current = null;
        }
        queueDragMove(dragging.id, dragging.isDef, Math.round(x), Math.round(y));
        flushDragMove();
        onCommitPlayerDrag?.();
        // Si c'était un drag attaquant et que la poursuite était active, on
        // termine le rAF loop (useCourtFrame fait un ease-out final).
        if (!dragging.isDef) {
          onEndDefenderPursuit?.();
        }
        setDragging(null);
        return;
      }
      if (pending) {
        const d = distance(pending.from, pending.to);
        if (d < 15) {
          // Clic simple sans drag : en mode pass → bascule en attente cible
          // pour une création auto au prochain clic sur un attaquant.
          if (state.tool === 'pass') {
            setPendingAutoSourceId(pending.fromId);
          }
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
        }, { fullT: annotationFullT });
        setPending(null);
      }
    },
    [
      dragging,
      flushDragMove,
      marquee,
      annotationFullT,
      onAddAnnotation,
      onCommitPlayerDrag,
      onMoveDefender,
      onMoveDefenderDuringDrag,
      onSetDefenderSelection,
      pending,
      queueDragMove,
      state.activeStep,
      state.attackingDirection,
      state.defenseInitial,
      state.fullCourt,
      state.playerCount,
      state.steps,
      state.tool,
      svgPoint,
    ]
  );

  return {
    pending,
    dragging,
    snapTarget,
    marquee,
    pendingAutoSourceId,
    svgPoint,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
