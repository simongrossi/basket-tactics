'use client';

import { formatStepCounter, stepCounterAt } from '@/lib/logic/stepNumbering';
import { actionsOfStep, isArrivalMovement } from '@/lib/logic/stepActions';
import { useInterfaceLevel } from './interface/InterfaceLevel';

// Composant principal du terrain. Rôle :
//
//  1. Conteneur SVG + viewBox (fullCourt ou half)
//  2. Délégation des hooks :
//     - `useCourtFrame` : calcule la frame courante (statique / scrub / play)
//     - `useCourtPointerHandlers` : drag joueurs + tracé d'annotations
//  3. Délégation des composants :
//     - `<CourtPlayersLayer>` : sprites attaquants + défenseurs + ballon
//     - `<CourtMenus>` : context menus (def/att) + zone region menu
//  4. Composition des overlays (zone, matchups, FOV, threats, helplines, etc.)
//  5. Gestion locale du context menu (state) et du clic-droit sur annotation
//
// La logique métier vit dans les hooks et sous-composants ; ce fichier est
// surtout du câblage.

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { ManualGestureFrame } from '@/lib/state/manualGestures';
import type {
  AppState,
  ActionTimingAnchor,
  AddAnnotationOptions,
  AttackerId,
  DefenderId,
  Annotation,
  Tool,
  Point,
  ComputedDefense,
  TextNote,
  PlayerId,
} from '@/lib/types';
import { CourtBackground, ArrowMarkers } from './Court';
import { Ball } from './Player';
import { AnnotationView } from './Annotations';
import { AnnotationHandles } from './court/AnnotationHandles';
import {
  Matchups,
  HelpLines,
  ScreenIndicator,
  ZoneOverlay,
  OffBallScreenIndicator,
} from './overlays/MatchupAndScreenOverlays';
import { ZoneCoverage } from './overlays/ZoneCoverage';
import { PassLanesOverlay } from './overlays/PassLanesOverlay';
import { TacticalMetricsOverlay } from './overlays/TacticalMetricsOverlay';
import { HelpDebugOverlay } from './overlays/HelpDebugOverlay';
import { DefenseTriangleOverlay } from './overlays/DefenseTriangleOverlay';
import { ScreenDebugOverlay } from './overlays/ScreenDebugOverlay';
import { ScreenPlayerDebugPanel } from './overlays/ScreenPlayerDebugPanel';
import { PlayerDebugTable } from './overlays/PlayerDebugTable';
import { FrameProfileOverlay } from './overlays/FrameProfileOverlay';
import { FieldOfViewOverlay } from './overlays/FieldOfViewOverlay';
import { getZoneLayout, mirrorZoneLayout, applyZoneOverrides } from '@/lib/data/zones';
import { ZoneEditOverlay } from './overlays/ZoneEditOverlay';
import {
  COURT,
  FULL_COURT_HEIGHT,
  HOOP,
  HOOP_OPPOSITE,
  PLAYER_RADIUS,
} from '@/lib/data/court';
import { distance } from '@/lib/logic/geometry';
import { ActionOrderBadges } from './overlays/ActionOrderBadges';
import { HeatmapOverlay } from './overlays/HeatmapOverlay';
import { ThreatOverlay } from './overlays/ThreatOverlay';
import { BestActionOverlay } from './overlays/BestActionOverlay';
import { GhostLayer } from './overlays/GhostLayer';
import { evaluateOffensiveOptions, bestOffensiveAction } from '@/lib/logic/offense';
import { getActiveDefenderIds, isActiveAttacker, activeBallCarrier } from '@/lib/logic/players';
import { useCourtFrame, type DisplayedCourtFrame } from '@/hooks/useCourtFrame';
import type { DefenderPursuit } from '@/hooks/useAppState';
import { useCourtPointerHandlers } from '@/hooks/useCourtPointerHandlers';
import { focusKindOf } from '@/hooks/useKeyboardShortcuts';
import { CourtPlayersLayer } from './court/CourtPlayersLayer';
import { CourtMenus, type CtxMenuState, type ZoneRegionMenuState } from './court/CourtMenus';
import { SnapGuideOverlay } from './court/SnapGuideOverlay';
import { DetectionBadgesOverlay } from './court/DetectionBadgesOverlay';
import { TextNotesLayer } from './court/TextNotesLayer';
import { TextNotePopup } from './court/TextNotePopup';
import { CourtTouchBar } from './court/CourtTouchBar';
import { PlayComposerModal } from './court/PlayComposerModal';
import type { StickyModifiers } from '@/hooks/useCourtPointerHandlers';
import type { CoachDiagnostic } from '@/lib/logic/coachDiagnostics';

interface CourtViewProps {
  onFrameChange?: (snapshot: DisplayedCourtFrame) => void;
  state: AppState;
  /** A.4 — Diagnostics coach déjà calculés en amont (page.tsx).
   *  Le composant en filtre les patterns visuellement importants
   *  pour les rendre en SVG (DetectionBadgesOverlay). */
  diagnostics?: CoachDiagnostic[];
  onMoveAttacker: (id: AttackerId, x: number, y: number) => void;
  onMoveDefender: (id: DefenderId, x: number, y: number) => void;
  onBeginPlayerDrag?: () => void;
  onMoveAttackerDuringDrag?: (id: AttackerId, x: number, y: number) => void;
  onMoveDefenderDuringDrag?: (id: DefenderId, x: number, y: number) => void;
  onCommitPlayerDrag?: () => void;
  onBeginDefenderPursuit?: (displayed?: Partial<Record<DefenderId, Point>>) => void;
  onEndDefenderPursuit?: () => void;
  /** Cf. useHistorizedState.registerPendingFlush : termine une fin de course
   *  avant un undo / redo / action historisée. */
  registerPendingGestureFlush?: (flush: (() => void) | null) => void;
  onDefenderPursuitSettled?: (finished: DefenderPursuit) => void;
  onAddAnnotation: (a: Annotation, options?: AddAnnotationOptions) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onApplyDefenderProfile: (dId: DefenderId, profile: import('@/lib/data/defenderProfiles').DefenderProfile) => void;
  /** Profil athlétique d'un défenseur (élite / standard / lent). */
  onSetDefenderSpeedProfile?: (dId: DefenderId, profile: 'elite' | 'standard' | 'lent' | undefined) => void;
  onClearDefenseOverride: (dId: DefenderId) => void;
  onSetBallCarrier: (oId: AttackerId) => void;
  onSetForcedScreener: (oId: AttackerId | null) => void;
  onClearAnnotationsFor: (oId: AttackerId) => void;
  onSetAttackerHand: (oId: AttackerId, hand: 'right' | 'left') => void;
  onSetAttackerProfile: (oId: AttackerId, profile: import('@/lib/types').OffensiveProfile) => void;
  onSetAttackerSpeedTier: (oId: AttackerId, tier: import('@/lib/types').AttackerSpeedTier | undefined) => void;
  onSetAttackerOrientation: (oId: AttackerId, patch: { body?: number | undefined; gaze?: number | undefined }) => void;
  onSetZoneOverride: (regionId: string, override: Partial<import('@/lib/types').ZoneRegionOverride>) => void;
  onClearZoneOverride: (regionId: string) => void;
  /** Supprime l'annotation `idx` stockée sur `stepIdx` (étape active par défaut). */
  onDeleteAnnotation: (idx: number, stepIdx?: number) => void;
  onSetAnnotationFrom: (stepIdx: number, annoIdx: number, point: { x: number; y: number }) => void;
  onSetAnnotationTo: (stepIdx: number, annoIdx: number, point: { x: number; y: number }) => void;
  onSetAnnotationWaypoint: (stepIdx: number, annoIdx: number, wpIdx: number, point: { x: number; y: number }) => void;
  onSetTool: (t: Tool) => void;
  onSetActionTimingAnchor?: (mode: ActionTimingAnchor) => void;
  onSetPlayerName: (id: PlayerId, name: string) => void;
  onSetPlayerNumber: (id: PlayerId, num: string) => void;
  /** A.3 — Notes texte libres : création, édition, suppression. */
  onAddTextNote: (stepIdx: number, note: TextNote) => void;
  onUpdateTextNote: (stepIdx: number, noteIdx: number, text: string) => void;
  onRemoveTextNote: (stepIdx: number, noteIdx: number) => void;
  isPlaying: boolean;
  /** Position de lecture (index d'étape fractionnaire) pour le badge ▶. */
  playbackT?: number | null;
  playbackSpeed: number;
  onPlaybackEnd?: () => void;
  onPlaybackTick?: (t: number) => void;
  scrubT?: number | null;
  /** Instant t (en unités d'étapes fractionnaires) à partir duquel reprendre
   *  la lecture quand `isPlaying` passe de false à true. 0 = du début. Lu
   *  au démarrage de la lecture pour décaler `playStart` ; ignoré ensuite. */
  playbackStartT?: number;
  playbackRunId?: number;
  /** Animation transitoire "Tout en auto réel" : positions de départ + start
   *  time. Quand non-null et hors playback/scrub, useCourtFrame lerp les
   *  positions défenseurs depuis `fromPositions` vers la cible auto. */
  defenseReleaseTransition?: import('@/hooks/useAppState').DefenseReleaseTransition | null;
  defenderPursuit?: import('@/hooks/useAppState').DefenderPursuit | null;
  /** B4 — état de la game loop "▶ Play IA (live)". Quand non-null, le
   *  rendu du terrain utilise ces positions au lieu du staticFrame.
   *  Priorité maximale dans la frame chain (au-dessus de playback et scrub). */
  liveMatchState?: import('@/lib/logic/match/gameLoop').MatchState | null;
  /** E.2 — Instant d'export. Quand défini, prime sur le scrub et le
   *  playback (cf. useCourtFrame). */
  exportT?: number | null;
  /** E.2 — Ref externe sur le `<svg>` du terrain. Permet à `Page` de lire
   *  le SVG live pendant l'export. */
  externalSvgRef?: React.MutableRefObject<SVGSVGElement | null>;
  isPlayerMode?: boolean;
  /** Terrain de consultation (page Simulation) : pas de commandes d'édition. */
  readOnly?: boolean;
  /** Enregistrement manuel : autorise uniquement les déplacements joueurs,
   *  leur sélection et la navigation du terrain. */
  gesturesOnly?: boolean;
  /** Coordonnées enregistrées à afficher telles quelles pendant un replay. */
  recordedFrame?: ManualGestureFrame | null;
  /** Permet au parent de contrôler l'ouverture de l'orchestrateur */
  composerOpen?: boolean;
  onCloseComposer?: () => void;
  modifiers?: StickyModifiers;
  onModifiersChange?: (m: StickyModifiers) => void;
}

export function CourtView(props: CourtViewProps) {
  const { analysis, development } = useInterfaceLevel();
  const { state } = props;
  const readOnly = !!props.readOnly || !!props.recordedFrame;
  // Les callbacks d'un rAF de drag déjà en attente doivent aussi respecter
  // un passage immédiat en lecture seule (arrêt/import d'un enregistrement).
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const editingBlocked = readOnly || !!props.gesturesOnly;
  const pointerState = useMemo<AppState>(
    () => props.gesturesOnly ? { ...state, tool: 'move' } : state,
    [state, props.gesturesOnly]
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [zoneRegionMenu, setZoneRegionMenu] = useState<ZoneRegionMenuState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  // U04 — modificateurs activés au doigt depuis la barre tactile ou sidebar.
  const [internalModifiers, setInternalModifiers] = useState<StickyModifiers>({});
  const stickyModifiers = props.modifiers ?? internalModifiers;
  const setStickyModifiers = useCallback((updater: React.SetStateAction<StickyModifiers>) => {
    if (props.onModifiersChange) {
      const next = typeof updater === 'function' ? updater(stickyModifiers) : updater;
      props.onModifiersChange(next);
    } else {
      setInternalModifiers(updater);
    }
  }, [props.onModifiersChange, stickyModifiers]);

  // #4 — Sélection multiple de défenseurs. State éphémère (UI), pas dans
  // AppState (pas de persistance, pas d'undo individuel).
  const [selectedDefenders, setSelectedDefenders] = useState<Set<DefenderId>>(new Set());
  const toggleDefenderSelection = useCallback((dId: DefenderId) => {
    setSelectedDefenders((prev) => {
      const next = new Set(prev);
      if (next.has(dId)) next.delete(dId);
      else next.add(dId);
      return next;
    });
  }, []);
  const setDefenderSelection = useCallback((ids: DefenderId[]) => {
    setSelectedDefenders(new Set(ids));
  }, []);
  const clearDefenderSelection = useCallback(() => setSelectedDefenders(new Set()), []);

  // A.3 — État du popup d'édition de note. null = fermé.
  const [textPopup, setTextPopup] = useState<{
    mode: 'create' | 'edit';
    courtPos: Point;
    screenPos: { x: number; y: number };
    noteIdx: number | null;
    initialText: string;
  } | null>(null);

  // Popover d'orchestration tactique d'étape (Play Composer).
  const [composerOpen, setComposerOpen] = useState(false);

  // Fermer le popup quand l'utilisateur change d'outil.
  useEffect(() => {
    if (state.tool !== 'text') setTextPopup(null);
  }, [state.tool]);

  useEffect(() => {
    if (!editingBlocked) return;
    setCtxMenu(null);
    setZoneRegionMenu(null);
    setTextPopup(null);
  }, [editingBlocked]);

  // Key listeners for spacebar tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (focusKindOf(document.activeElement) === 'other') {
          e.preventDefault();
          setSpacePressed(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        setSpacePressed(false);
      }
    };
    const handleBlur = () => setSpacePressed(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Native Wheel listener centered on cursor for non-passive prevention of scroll
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const centerX = e.clientX - rect.left;
      const centerY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
      setTransform((prev) => {
        const nextScale = Math.max(0.5, Math.min(5, prev.scale * zoomFactor));
        if (nextScale === prev.scale) return prev;
        const factor = nextScale / prev.scale;
        const nextX = centerX - (centerX - prev.x) * factor;
        const nextY = centerY - (centerY - prev.y) * factor;
        return { scale: nextScale, x: nextX, y: nextY };
      });
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Esc clear la sélection.
  useEffect(() => {
    if (selectedDefenders.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearDefenderSelection();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedDefenders.size, clearDefenderSelection]);

  // Frame courante (statique / scrub / play) + threats.
  const { frame, threatData } = useCourtFrame({
    onFrameChange: props.onFrameChange,
    state,
    recordedFrame: props.recordedFrame,
    isPlaying: props.isPlaying,
    playbackSpeed: props.playbackSpeed,
    playbackStartT: props.playbackStartT ?? 0,
    playbackRunId: props.playbackRunId,
    scrubT: props.scrubT,
    exportT: props.exportT,
    onPlaybackTick: props.onPlaybackTick,
    onPlaybackEnd: props.onPlaybackEnd,
    defenseReleaseTransition: props.defenseReleaseTransition,
    defenderPursuit: props.defenderPursuit,
    onDefenderPursuitSettled: props.onDefenderPursuitSettled,
    liveMatchState: props.liveMatchState,
  });

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const closeZoneRegionMenu = useCallback(() => setZoneRegionMenu(null), []);

  // A.3 — Notes texte de l'étape active (couche additive, hors moteurs).
  const currentTextNotes: TextNote[] =
    state.steps[state.activeStep]?.textNotes ?? [];

  // Pointer/drag + tracé d'annotation + marquee.
  const { pending, dragging, snapTarget, marquee, pendingAutoSourceId, cancelPendingAuto, svgPoint, onPointerDown, onPointerMove, onPointerUp } =
    useCourtPointerHandlers({
      state: pointerState,
      svgRef,
      isPlaying: props.isPlaying,
      isPlayerMode: props.isPlayerMode || readOnly,
      disableLongPress: editingBlocked,
      onBeginPlayerDrag: () => { if (!readOnlyRef.current) props.onBeginPlayerDrag?.(); },
      onCommitPlayerDrag: () => { if (!readOnlyRef.current) props.onCommitPlayerDrag?.(); },
      onBeginDefenderPursuit: (displayed) => { if (!readOnlyRef.current) props.onBeginDefenderPursuit?.(displayed); },
      onEndDefenderPursuit: () => { if (!readOnlyRef.current) props.onEndDefenderPursuit?.(); },
      registerPendingGestureFlush: props.registerPendingGestureFlush,
      onMoveAttacker: (id, x, y) => { if (!readOnlyRef.current) props.onMoveAttacker(id, x, y); },
      onMoveDefender: (id, x, y) => { if (!readOnlyRef.current) props.onMoveDefender(id, x, y); },
      onMoveAttackerDuringDrag: props.onMoveAttackerDuringDrag && ((id, x, y) => {
        if (!readOnlyRef.current) props.onMoveAttackerDuringDrag?.(id, x, y);
      }),
      onMoveDefenderDuringDrag: props.onMoveDefenderDuringDrag && ((id, x, y) => {
        if (!readOnlyRef.current) props.onMoveDefenderDuringDrag?.(id, x, y);
      }),
      onAddAnnotation: (annotation, options) => {
        if (!editingBlocked) props.onAddAnnotation(annotation, options);
      },
      annotationFullT: props.scrubT ?? null,
      frameOff: frame.off,
      frameDefPos: frame.defPos,
      onClearContextMenu: closeCtxMenu,
      selectedDefenders,
      onToggleDefenderSelection: toggleDefenderSelection,
      onSetDefenderSelection: setDefenderSelection,
      onClearDefenderSelection: clearDefenderSelection,
      textNotes: currentTextNotes,
      onTextToolClick: ({ courtPos, screenPos, noteIdx }) => {
        if (editingBlocked) return;
        if (noteIdx === null) {
          setTextPopup({
            mode: 'create',
            courtPos,
            screenPos,
            noteIdx: null,
            initialText: '',
          });
        } else {
          const note = currentTextNotes[noteIdx];
          setTextPopup({
            mode: 'edit',
            courtPos: note.pos,
            screenPos,
            noteIdx,
            initialText: note.text,
          });
        }
      },
      onOpenContextMenu: (id, clientX, clientY) => {
        if (editingBlocked) return;
        const wrap = svgRef.current?.parentElement?.getBoundingClientRect();
        if (!wrap) return;
        const x = clientX - wrap.left;
        const y = clientY - wrap.top;
        if (id.startsWith('D')) {
          setCtxMenu({ kind: 'defender', dId: id as DefenderId, x, y });
        } else if (id.startsWith('O')) {
          setCtxMenu({ kind: 'attacker', oId: id as AttackerId, x, y });
        }
      },
      transform,
      onTransformChange: setTransform,
      spacePressed,
      stickyModifiers,
      contentRef,
    });

  // Clic-droit : suppression directe sur une annotation, sinon ouverture
  // du context menu du joueur sous le curseur (avec fallback proximité si
  // un poseur d'écran masque le data-id).
  const onContextMenu = (e: React.MouseEvent) => {
    if (editingBlocked) {
      e.preventDefault();
      return;
    }
    const annotationG = (e.target as Element).closest('g[data-annotation-idx]');
    const annoIdxStr = annotationG?.getAttribute('data-annotation-idx');
    const annoStepStr = annotationG?.getAttribute('data-annotation-step');
    if (annoIdxStr !== null && annoIdxStr !== undefined) {
      e.preventDefault();
      props.onDeleteAnnotation(
        parseInt(annoIdxStr, 10),
        annoStepStr != null ? parseInt(annoStepStr, 10) : undefined,
      );
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
      const pt = svgPoint(e);
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

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((prev) => {
      const nextScale = Math.min(5, prev.scale * 1.25);
      const factor = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cx - (cx - prev.x) * factor,
        y: cy - (cy - prev.y) * factor,
      };
    });
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((prev) => {
      const nextScale = Math.max(0.5, prev.scale / 1.25);
      const factor = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cx - (cx - prev.x) * factor,
        y: cy - (cy - prev.y) * factor,
      };
    });
  };

  const handleZoomReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTransform({ scale: 1, x: 0, y: 0 });
  };

  return (
    <div
      onContextMenu={onContextMenu}
      onDoubleClickCapture={(event) => {
        if (!editingBlocked) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDownCapture={(event) => {
        const key = event.key.toLowerCase();
        const changesCourt = ['delete', 'backspace', 'arrowleft', 'arrowright', 'pageup', 'pagedown', ',', '.', 'm', 'p', 'd', 'r', 'e', 't'].includes(key)
          || ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y'));
        if (!editingBlocked || !changesCourt) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{
        position: 'relative',
        background: 'var(--bt-court-bg)',
        borderRadius: 12,
        padding: 6,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        border: '1px solid var(--bt-court-border)',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <svg
        ref={(el) => {
          (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el;
          if (props.externalSvgRef) props.externalSvgRef.current = el;
        }}
        viewBox={`0 0 ${COURT.width} ${state.fullCourt ? FULL_COURT_HEIGHT : COURT.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          touchAction: 'none',
          userSelect: 'none',
          cursor: spacePressed
            ? (dragging ? 'grabbing' : 'grab')
            : dragging
              ? 'grabbing'
              : pending || ['pass', 'cut', 'dribble', 'screen'].includes(pointerState.tool)
                ? 'crosshair'
                : pointerState.tool === 'text'
                  ? 'text'
                  : 'default',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ArrowMarkers />
        <g ref={contentRef} transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          <CourtBackground
            fullCourt={state.fullCourt}
            attackingDirection={state.attackingDirection}
            courtTheme={state.courtTheme}
            showSpacingSpots={state.showSpacingSpots}
          />

        {/* #2 — Feedback visuel snap-to-grid pendant le drag avec Ctrl/Cmd. */}
        <SnapGuideOverlay
          target={snapTarget}
          attackingDirection={state.attackingDirection}
          courtHeight={state.fullCourt ? FULL_COURT_HEIGHT : COURT.height}
        />

        {/* ---- Couches zone (overlay + edit) ---- */}
        {state.defenseSystem === 'zone' && (() => {
          const activeDefenders = new Set(getActiveDefenderIds(state.playerCount));
          const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
          const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
          const zoneLayout = applyZoneOverrides(oriented, state.zoneOverrides).filter((z) =>
            activeDefenders.has(z.assignedTo)
          );
          if (state.zoneEditMode && !editingBlocked) {
            return (
              <ZoneEditOverlay
                layout={zoneLayout}
                toCourtPoint={(cx, cy) => {
                  const svg = svgRef.current;
                  if (!svg) return null;
                  const el = contentRef.current ?? svg;
                  const pt = svg.createSVGPoint();
                  pt.x = cx;
                  pt.y = cy;
                  const getCTM = () => {
                    if (typeof el.getScreenCTM === 'function') return el.getScreenCTM();
                    if (typeof svg.getScreenCTM === 'function') return svg.getScreenCTM();
                    return null;
                  };
                  const ctm = getCTM();
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

        {/* ---- Matchups vs ZoneCoverage ---- */}
        {state.defenseSystem === 'zone' ? (() => {
          const activeDefenders = new Set(getActiveDefenderIds(state.playerCount));
          const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
          const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
          const zoneLayout = applyZoneOverrides(oriented, state.zoneOverrides).filter((z) =>
            activeDefenders.has(z.assignedTo)
          );
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

        {/* ---- Overlays arrière (sous les sprites) ---- */}
        <HeatmapOverlay
          defPos={frame.defPos}
          off={frame.off}
          fullCourt={state.fullCourt}
          show={analysis && !!state.showHeatmap}
        />
        {/* Champs de vision joueurs — activables individuellement par défenseur
            via clic-droit (rule.showFieldOfView), OU globalement sur tous les
            joueurs (défenseurs + attaquants) via le toggle Paramètres
            (state.showFieldOfViewAll). Heatmap croisée par superposition. */}
        {analysis && <FieldOfViewOverlay
          defPos={frame.defPos}
          off={frame.off}
          attVisuals={frame.attVisuals}
          rules={state.rules}
          showAll={!!state.showFieldOfViewAll}
          showAllDefenders={!!state.showFieldOfViewAllDefenders}
          showAllAttackers={!!state.showFieldOfViewAllAttackers}
        />}
        <HelpLines off={frame.off} defPos={frame.defPos} defenseDistance={state.defenseDistance} show={state.showHelpLines} />
        {/* Anneaux de menace — rendus AVANT les sprites pour que les icônes
            joueur passent par-dessus l'anneau (visuel plus propre). */}
        {analysis && threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="rings" />}
        {state.showGhosts && state.activeStep > 0 && !props.isPlaying && props.scrubT == null && (
          <GhostLayer state={state} stepIdx={state.activeStep - 1} currentStepIdx={state.activeStep} />
        )}

        {/* ---- Sprites joueurs ---- */}
        <CourtPlayersLayer state={state} frame={frame} selectedDefenders={selectedDefenders} />

        {/* ---- Overlays avant (au-dessus des sprites) ---- */}
        {/* F.4 — Disqualifications : croix rouge sur les sprites des
            joueurs DQ. Visible quelle que soit la frame (statique,
            scrub, play, live). */}
        {state.disqualifiedPlayers && state.disqualifiedPlayers.length > 0 && (
          <g pointerEvents="none">
            {state.disqualifiedPlayers.map((id) => {
              const pos =
                id.startsWith('O')
                  ? frame.off[id as AttackerId]
                  : frame.defPos[id as DefenderId];
              if (!pos) return null;
              return (
                <g key={`dq-${id}`}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={20}
                    fill="rgba(127, 29, 29, 0.4)"
                    stroke="#7f1d1d"
                    strokeWidth={2}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#fee2e2"
                  >
                    DQ
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y - 22}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill="#7f1d1d"
                  >
                    {id}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {/* E.1 V2 stage 2b — banner "PHASE ADVERSE" en mode édition statique.
            Affiché quand le step actif a Step.viewSide === 'away' (= généré
            par convertStepToAwayPossession). Différent du banner game loop
            (qui dépend de liveMatchState.attackingTeam). */}
        {state.steps[state.activeStep]?.viewSide === 'away' && !props.liveMatchState && (
          <g pointerEvents="none">
            <rect
              x={170}
              y={40}
              width={260}
              height={22}
              rx={4}
              fill="#991b1b"
              opacity={0.85}
              stroke="#dc2626"
              strokeWidth={1}
            />
            <text
              x={300}
              y={55}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="#fee2e2"
              letterSpacing={0.4}
            >
              🔄 PHASE ADVERSE (édition)
            </text>
          </g>
        )}

        {/* E.1 V2 stage 1+2a — possession adverse : ballon + 5 adversaires
            simulés rendus visuellement (couleur rouge distinctive). Donne
            le visuel complet de "l'autre équipe attaque". */}
        {props.liveMatchState?.awayBallPos &&
          props.liveMatchState.attackingTeam === 'away' && (
            <g pointerEvents="none">
              {/* Banner haut du terrain */}
              <rect
                x={state.fullCourt ? 180 : 180}
                y={40}
                width={240}
                height={22}
                rx={4}
                fill="#991b1b"
                opacity={0.92}
              />
              <text
                x={300}
                y={55}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill="#fee2e2"
              >
                🔄 POSSESSION ADVERSE
              </text>
              {/* V2 stage 2a — 5 adversaires simulés en sprites rouges */}
              {props.liveMatchState.awayPlayerPositions &&
                (Object.entries(props.liveMatchState.awayPlayerPositions) as Array<
                  [string, { x: number; y: number }]
                >).map(([id, pos]) => (
                  <g key={`away-${id}`}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={14}
                      fill="#fee2e2"
                      stroke="#dc2626"
                      strokeWidth={2}
                      opacity={0.85}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="#7f1d1d"
                    >
                      A{id.slice(1)}
                    </text>
                  </g>
                ))}
              {/* Ballon adverse animé (au-dessus des sprites) */}
              <circle
                cx={props.liveMatchState.awayBallPos.x}
                cy={props.liveMatchState.awayBallPos.y}
                r={8}
                fill="#dc2626"
                stroke="#7f1d1d"
                strokeWidth={1.5}
              >
                <animate
                  attributeName="r"
                  values="8;10;8"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              </circle>
              <text
                x={props.liveMatchState.awayBallPos.x}
                y={props.liveMatchState.awayBallPos.y - 14}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#7f1d1d"
              >
                away
              </text>
            </g>
          )}
        {/* Inbound — badge "⏱ REMISE 5s" près du passeur si le step est
            en context inbound-*. Aide à comprendre que le passeur est
            hors-ligne et qu'on étudie une remise spécifique. */}
        {(() => {
          const cur = state.steps[state.activeStep];
          const ctx = cur?.context;
          if (
            ctx !== 'inbound-baseline' &&
            ctx !== 'inbound-sideline-low' &&
            ctx !== 'inbound-sideline-high'
          ) {
            return null;
          }
          const carrierPos = frame.off[frame.carrier];
          if (!carrierPos) return null;
          const label =
            ctx === 'inbound-baseline'
              ? 'BLOB · 5s'
              : ctx === 'inbound-sideline-low'
                ? 'SLOB bas · 5s'
                : 'SLOB haut · 5s';
          // Pression visuelle : trouver le défenseur du passeur (= défenseur
          // matched, ou le plus proche par défaut). Anneau pulsant rouge
          // pour indiquer que ce défenseur DOIT presser pour forcer la
          // violation 5s.
          let presserX: number | null = null;
          let presserY: number | null = null;
          let bestDist = Infinity;
          (Object.entries(frame.defPos) as Array<[string, { x: number; y: number; matchedTo?: string }]>).forEach(
            ([, def]) => {
              if (def.matchedTo === frame.carrier) {
                presserX = def.x;
                presserY = def.y;
              }
            }
          );
          if (presserX === null) {
            (Object.values(frame.defPos) as Array<{ x: number; y: number }>).forEach((def) => {
              const d = Math.hypot(def.x - carrierPos.x, def.y - carrierPos.y);
              if (d < bestDist) {
                bestDist = d;
                presserX = def.x;
                presserY = def.y;
              }
            });
          }
          return (
            <g pointerEvents="none">
              {/* Badge label */}
              <rect
                x={carrierPos.x - 32}
                y={carrierPos.y - 36}
                width={64}
                height={16}
                rx={3}
                fill="#7f1d1d"
                opacity={0.92}
              />
              <text
                x={carrierPos.x}
                y={carrierPos.y - 24}
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill="#fee2e2"
              >
                ⏱ {label}
              </text>
              {/* Pression visuelle : anneau pulsant rouge autour du
                  défenseur qui presse le passeur. */}
              {presserX !== null && presserY !== null && (
                <>
                  <circle
                    cx={presserX}
                    cy={presserY}
                    r={22}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth={2}
                    opacity={0.85}
                  >
                    <animate
                      attributeName="r"
                      values="22;28;22"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.85;0.3;0.85"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <text
                    x={presserX}
                    y={presserY - 26}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill="#dc2626"
                  >
                    🔥 presse
                  </text>
                </>
              )}
            </g>
          );
        })()}
        {/* A.4 — Badges détections (reject screen, snake, empty side, def 3sec).
            Rendus APRÈS les joueurs pour passer au-dessus, AVANT les threats
            badges pour pouvoir cohabiter sans masquer. */}
        {state.showDetectionBadges !== false && props.diagnostics && (
          <DetectionBadgesOverlay
            diagnostics={props.diagnostics}
            off={frame.off}
            defPos={frame.defPos}
          />
        )}
        {/* Badges % de menace + flèche meilleure action — rendus APRÈS les
            joueurs pour passer AU-DESSUS des icônes (~17px de rayon). */}
        {analysis && threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="badges" />}
        {analysis && state.showBestAction && (() => {
          const carrier = frame.carrier;
          const actions = evaluateOffensiveOptions(frame.off, frame.defPos, carrier, undefined, state.attackerProfiles);
          const best = bestOffensiveAction(actions);
          if (!best) return null;
          return <BestActionOverlay off={frame.off} carrier={carrier} best={best} show />;
        })()}

        {/* ---- Annotations + preview ---- */}
        <g>
          {/* Actions qui partent de l'étape affichée (passes comprises, bien
              que stockées sur l'étape d'arrivée) — cf. stepActions. */}
          {actionsOfStep(state.steps, frame.stepIdx)
            .filter(({ annotation }) =>
              isActiveAttacker(annotation.fromId, state.playerCount) &&
              (!annotation.toId || isActiveAttacker(annotation.toId, state.playerCount))
            )
            .map(({ annotation: a, index, stepIdx: annoStep }) => (
              <g key={`${annoStep}-${index}`} data-annotation-idx={index} data-annotation-step={annoStep} style={{ cursor: editingBlocked ? undefined : 'context-menu' }}>
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
          {!editingBlocked && pending && pending.from && <AnnotationView annotation={pending as Annotation} preview />}
        </g>

        {/* Poignées d'édition des annotations de mouvement — pause uniquement
            pour ne pas polluer la lecture. L'overlay vit après les annotations
            pour rester au-dessus visuellement (z-order SVG = ordre du DOM). */}
        {!editingBlocked && !props.isPlaying && state.steps[frame.stepIdx] && (
          <AnnotationHandles
            annotations={state.steps[frame.stepIdx].annotations}
            isHidden={(a) => isArrivalMovement(state.steps[frame.stepIdx], a)}
            svgPoint={svgPoint}
            onCommitFrom={(annoIdx, p) => props.onSetAnnotationFrom(frame.stepIdx, annoIdx, p)}
            onCommitTo={(annoIdx, p) => props.onSetAnnotationTo(frame.stepIdx, annoIdx, p)}
            onCommitWaypoint={(annoIdx, wpIdx, p) =>
              props.onSetAnnotationWaypoint(frame.stepIdx, annoIdx, wpIdx, p)
            }
          />
        )}

        <PassLanesOverlay
          off={frame.off}
          defPos={frame.defPos}
          carrier={frame.carrier}
          show={state.showPassLanes}
          showContested={state.showContestedPass !== false}
          showBlocked={state.showBlockedPass !== false}
        />
        <TacticalMetricsOverlay
          off={frame.off}
          carrier={frame.carrier}
          hoop={state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP}
          show={analysis && !!state.showTacticalMetrics}
        />
        {development && state.showHelpDebug && <HelpDebugOverlay defPos={frame.defPos} />}
        {analysis && state.showDefenseTriangles && (
          <DefenseTriangleOverlay defPos={frame.defPos} off={frame.off} carrier={frame.carrier} />
        )}
        {development && state.showScreenDebug && (
          <ScreenDebugOverlay
            off={frame.off}
            defPos={frame.defPos}
            screen={frame.screen}
            offBallScreens={frame.offBallScreens}
            debug={frame.debug}
          />
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
        {state.showActionOrder && !props.isPlaying && props.scrubT == null && state.steps[state.activeStep] && (() => {
          const step = state.steps[state.activeStep];
          return (
            <ActionOrderBadges
              step={{
                ...step,
                off: frame.off,
                ballCarrier: frame.carrier,
                annotations: actionsOfStep(state.steps, state.activeStep)
                  .map(({ annotation }) => annotation)
                  .filter((a) => isActiveAttacker(a.fromId, state.playerCount) &&
                    (!a.toId || isActiveAttacker(a.toId, state.playerCount))),
              }}
            />
          );
        })()}
        <Ball pos={frame.ballPos} inFlight={frame.ballInFlight} />
        {analysis && threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="badges" />}

        {/* #4 — Rectangle de sélection (marquee) pendant Shift+drag dans le vide. */}
        {marquee && (
          <rect
            x={marquee.x1}
            y={marquee.y1}
            width={marquee.x2 - marquee.x1}
            height={marquee.y2 - marquee.y1}
            fill="rgba(6, 182, 212, 0.12)"
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        {/* A.3 — Couche des notes texte. Rendue tard pour passer au-dessus
            des joueurs ; pointerEvents="none" → le hit-test est géré par le
            pointer handler (source de vérité unique). */}
        <TextNotesLayer notes={currentTextNotes} />

        {/* Halo "passe auto en attente cible" — affiché autour du joueur source
            tant que le user n'a pas cliqué sur la cible (Escape pour annuler). */}
        {pendingAutoSourceId && frame.off[pendingAutoSourceId] && (
          <circle
            cx={frame.off[pendingAutoSourceId].x}
            cy={frame.off[pendingAutoSourceId].y}
            r={PLAYER_RADIUS + 8}
            fill="none"
            stroke="#FF5500"
            strokeWidth={2.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          >
            <animate attributeName="r" values={`${PLAYER_RADIUS + 6};${PLAYER_RADIUS + 10};${PLAYER_RADIUS + 6}`} dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
        </g>
      </svg>

      {/* A.3 — Popup d'édition de note (HTML position:fixed, hors SVG). */}
      {!editingBlocked && textPopup && (
        <TextNotePopup
          screen={textPopup.screenPos}
          initialText={textPopup.initialText}
          isEditing={textPopup.mode === 'edit'}
          onSubmit={(text) => {
            if (textPopup.mode === 'create') {
              props.onAddTextNote(state.activeStep, { pos: textPopup.courtPos, text });
            } else if (textPopup.noteIdx !== null) {
              props.onUpdateTextNote(state.activeStep, textPopup.noteIdx, text);
            }
            setTextPopup(null);
          }}
          onDelete={() => {
            if (textPopup.mode === 'edit' && textPopup.noteIdx !== null) {
              props.onRemoveTextNote(state.activeStep, textPopup.noteIdx);
            }
            setTextPopup(null);
          }}
          onCancel={() => setTextPopup(null)}
        />
      )}

      {pendingAutoSourceId && !props.isPlaying && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(216, 90, 48, 0.92)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          passe auto depuis <b>{pendingAutoSourceId}</b> — touchez le receveur
        </div>
      )}

      {/* #4 — Mini panneau d'info quand la sélection multiple est active. */}
      {selectedDefenders.size > 0 && !props.isPlaying && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(6, 182, 212, 0.92)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          <span>🔗 {selectedDefenders.size} défenseur{selectedDefenders.size > 1 ? 's' : ''} sélectionné{selectedDefenders.size > 1 ? 's' : ''}</span>
          <button
            onClick={clearDefenderSelection}
            className="bt-touch"
            aria-label="Vider la sélection"
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            title="Vider la sélection (Échap)"
          >
            ✕
          </button>
        </div>
      )}

      {development && state.showScreenDebug && (
        <ScreenPlayerDebugPanel frame={frame} selectedDefenders={selectedDefenders} />
      )}

      {development && state.showPlayerDebug && (
        <PlayerDebugTable frame={frame} visible />
      )}

      {development && state.showProfileOverlay && (
        <FrameProfileOverlay frame={frame} visible />
      )}

      {/* ---- Badge "lecture en cours" ---- */}
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
            {(() => {
              // Même numérotation que le panneau Étapes et la timeline.
              const counter = stepCounterAt(state.steps, props.playbackT ?? frame.stepIdx);
              const label = counter.rowIndex != null ? state.steps[counter.rowIndex]?.label : undefined;
              return `${formatStepCounter(counter)}${label ? ` — ${label}` : ''}`;
            })()}
          </span>
        </div>
      )}

      {/* ---- Menus contextuels ---- */}
      {!editingBlocked && <CourtMenus
        state={state}
        frame={frame}
        ctxMenu={ctxMenu}
        zoneRegionMenu={zoneRegionMenu}
        onSetTool={props.onSetTool}
        onSetActionTimingAnchor={props.onSetActionTimingAnchor}
        onCloseCtxMenu={closeCtxMenu}
        onCloseZoneRegionMenu={closeZoneRegionMenu}
        onUpdateRule={props.onUpdateRule}
        onApplyDefenderProfile={props.onApplyDefenderProfile}
        onSetDefenderSpeedProfile={props.onSetDefenderSpeedProfile}
        onClearDefenseOverride={props.onClearDefenseOverride}
        onSetBallCarrier={props.onSetBallCarrier}
        onSetForcedScreener={props.onSetForcedScreener}
        onClearAnnotationsFor={props.onClearAnnotationsFor}
        onSetAttackerHand={props.onSetAttackerHand}
        onSetAttackerProfile={props.onSetAttackerProfile}
        onSetAttackerSpeedTier={props.onSetAttackerSpeedTier}
        onSetAttackerOrientation={props.onSetAttackerOrientation}
        onAddAnnotation={props.onAddAnnotation}
        onSetZoneOverride={props.onSetZoneOverride}
        onClearZoneOverride={props.onClearZoneOverride}
        onSetPlayerName={props.onSetPlayerName}
        onSetPlayerNumber={props.onSetPlayerNumber}
      />}

      {!props.isPlaying && !props.isPlayerMode && !readOnly && (
        <CourtTouchBar
          tool={pointerState.tool}
          modifiers={stickyModifiers}
          onChangeModifiers={setStickyModifiers}
          annotationCount={props.gesturesOnly ? 0 : actionsOfStep(state.steps, state.activeStep).length}
          onDeleteLastAnnotation={() => {
            if (editingBlocked) return;
            const actions = actionsOfStep(state.steps, state.activeStep);
            const last = actions[actions.length - 1];
            if (last) props.onDeleteAnnotation(last.index, last.stepIdx);
          }}
          pendingAutoSourceId={props.gesturesOnly ? null : pendingAutoSourceId}
          onCancelPendingAuto={cancelPendingAuto}
          selectedDefenders={selectedDefenders}
          onClearSelection={clearDefenderSelection}
          onOpenComposer={props.gesturesOnly ? undefined : () => setComposerOpen(true)}
        />
      )}

      {/* Popover / Modal Orchestrateur tactique d'étape (Play Composer) */}
      <PlayComposerModal
        state={state}
        isOpen={(props.composerOpen !== undefined ? props.composerOpen : composerOpen) && !readOnly && !props.isPlaying}
        onClose={() => {
          setComposerOpen(false);
          props.onCloseComposer?.();
        }}
        onApplyPlan={(actions, nextCarrier) => {
          if (editingBlocked) return;
          actions.forEach((a) => props.onAddAnnotation(a));
          if (nextCarrier && nextCarrier !== activeBallCarrier(state.steps[state.activeStep], state.playerCount)) {
            props.onSetBallCarrier(nextCarrier);
          }
        }}
      />



      {/* Floating Zoom Controls (discrets, repliés dans l'angle sans masquer le jeu) */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--bt-zoom-bg)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--bt-court-border)',
          padding: 3,
          borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
          zIndex: 40,
          opacity: 0.7,
          transition: 'opacity 0.2s ease, background 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.background = 'var(--bt-zoom-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.7';
          e.currentTarget.style.background = 'var(--bt-zoom-bg)';
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomIn}
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            border: 'none',
            background: 'var(--bt-zoom-btn)',
            color: 'var(--bt-zoom-text)',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          title="Zoomer (+)"
          aria-label="Zoomer"
          className="bt-touch"
        >
          ＋
        </button>
        <button
          onClick={handleZoomOut}
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            border: 'none',
            background: 'var(--bt-zoom-btn)',
            color: 'var(--bt-zoom-text)',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          title="Dézoomer (-)"
          aria-label="Dézoomer"
          className="bt-touch"
        >
          －
        </button>
        <button
          onClick={handleZoomReset}
          style={{
            width: 28,
            height: 24,
            borderRadius: 4,
            border: 'none',
            background: 'var(--bt-zoom-btn)',
            color: 'var(--bt-zoom-text)',
            fontSize: 8,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          title="Réinitialiser le zoom"
          aria-label="Réinitialiser le zoom"
          className="bt-touch"
        >
          1:1
        </button>
      </div>
    </div>
  );
}
