'use client';

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

import { useEffect, useState, useRef, useCallback } from 'react';
import type {
  AppState,
  AttackerId,
  DefenderId,
  Annotation,
  Tool,
  Point,
  ComputedDefense,
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
import { getActiveDefenderIds, isActiveAttacker } from '@/lib/logic/players';
import { useCourtFrame } from '@/hooks/useCourtFrame';
import { useCourtPointerHandlers } from '@/hooks/useCourtPointerHandlers';
import { CourtPlayersLayer } from './court/CourtPlayersLayer';
import { CourtMenus, type CtxMenuState, type ZoneRegionMenuState } from './court/CourtMenus';
import { SnapGuideOverlay } from './court/SnapGuideOverlay';
import { DetectionBadgesOverlay } from './court/DetectionBadgesOverlay';
import type { CoachDiagnostic } from '@/lib/logic/coachDiagnostics';

interface CourtViewProps {
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
  onAddAnnotation: (a: Annotation) => void;
  onUpdateRule: (dId: DefenderId, patch: Partial<AppState['rules'][DefenderId]>) => void;
  onApplyDefenderProfile: (dId: DefenderId, profile: import('@/lib/data/defenderProfiles').DefenderProfile) => void;
  onClearDefenseOverride: (dId: DefenderId) => void;
  onSetBallCarrier: (oId: AttackerId) => void;
  onSetForcedScreener: (oId: AttackerId | null) => void;
  onClearAnnotationsFor: (oId: AttackerId) => void;
  onSetAttackerHand: (oId: AttackerId, hand: 'right' | 'left') => void;
  onSetAttackerProfile: (oId: AttackerId, profile: import('@/lib/types').OffensiveProfile) => void;
  onSetAttackerOrientation: (oId: AttackerId, patch: { body?: number | undefined; gaze?: number | undefined }) => void;
  onSetZoneOverride: (regionId: string, override: Partial<import('@/lib/types').ZoneRegionOverride>) => void;
  onClearZoneOverride: (regionId: string) => void;
  onDeleteAnnotation: (idx: number) => void;
  onSetAnnotationFrom: (stepIdx: number, annoIdx: number, point: { x: number; y: number }) => void;
  onSetAnnotationTo: (stepIdx: number, annoIdx: number, point: { x: number; y: number }) => void;
  onSetAnnotationWaypoint: (stepIdx: number, annoIdx: number, wpIdx: number, point: { x: number; y: number }) => void;
  onSetTool: (t: Tool) => void;
  isPlaying: boolean;
  playbackSpeed: number;
  onPlaybackEnd?: () => void;
  onPlaybackTick?: (t: number) => void;
  scrubT?: number | null;
  /** Instant t (en unités d'étapes fractionnaires) à partir duquel reprendre
   *  la lecture quand `isPlaying` passe de false à true. 0 = du début. Lu
   *  au démarrage de la lecture pour décaler `playStart` ; ignoré ensuite. */
  playbackStartT?: number;
  /** Animation transitoire "Tout en auto réel" : positions de départ + start
   *  time. Quand non-null et hors playback/scrub, useCourtFrame lerp les
   *  positions défenseurs depuis `fromPositions` vers la cible auto. */
  defenseReleaseTransition?: import('@/hooks/useAppState').DefenseReleaseTransition | null;
  /** B4 — état de la game loop "▶ Play IA (live)". Quand non-null, le
   *  rendu du terrain utilise ces positions au lieu du staticFrame.
   *  Priorité maximale dans la frame chain (au-dessus de playback et scrub). */
  liveMatchState?: import('@/lib/logic/match/gameLoop').MatchState | null;
}

export function CourtView(props: CourtViewProps) {
  const { state } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoneRegionMenu, setZoneRegionMenu] = useState<ZoneRegionMenuState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

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
    state,
    isPlaying: props.isPlaying,
    playbackSpeed: props.playbackSpeed,
    playbackStartT: props.playbackStartT ?? 0,
    scrubT: props.scrubT,
    onPlaybackTick: props.onPlaybackTick,
    onPlaybackEnd: props.onPlaybackEnd,
    defenseReleaseTransition: props.defenseReleaseTransition,
    liveMatchState: props.liveMatchState,
  });

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
  const closeZoneRegionMenu = useCallback(() => setZoneRegionMenu(null), []);

  // Pointer/drag + tracé d'annotation + marquee.
  const { pending, snapTarget, marquee, pendingAutoSourceId, svgPoint, onPointerDown, onPointerMove, onPointerUp } =
    useCourtPointerHandlers({
      state,
      svgRef,
      isPlaying: props.isPlaying,
      onBeginPlayerDrag: props.onBeginPlayerDrag,
      onCommitPlayerDrag: props.onCommitPlayerDrag,
      onMoveAttacker: props.onMoveAttacker,
      onMoveDefender: props.onMoveDefender,
      onMoveAttackerDuringDrag: props.onMoveAttackerDuringDrag,
      onMoveDefenderDuringDrag: props.onMoveDefenderDuringDrag,
      onAddAnnotation: props.onAddAnnotation,
      onClearContextMenu: closeCtxMenu,
      selectedDefenders,
      onToggleDefenderSelection: toggleDefenderSelection,
      onSetDefenderSelection: setDefenderSelection,
      onClearDefenderSelection: clearDefenderSelection,
    });

  // Clic-droit : suppression directe sur une annotation, sinon ouverture
  // du context menu du joueur sous le curseur (avec fallback proximité si
  // un poseur d'écran masque le data-id).
  const onContextMenu = (e: React.MouseEvent) => {
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

  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        background: '#262a32',
        borderRadius: 12,
        padding: 6,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        border: '1px solid #2a2d35',
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
        onPointerCancel={onPointerUp}
      >
        <ArrowMarkers />
        <CourtBackground fullCourt={state.fullCourt} attackingDirection={state.attackingDirection} />

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
          show={!!state.showHeatmap}
        />
        {/* Champs de vision joueurs — activables individuellement par défenseur
            via clic-droit (rule.showFieldOfView), OU globalement sur tous les
            joueurs (défenseurs + attaquants) via le toggle Paramètres
            (state.showFieldOfViewAll). Heatmap croisée par superposition. */}
        <FieldOfViewOverlay
          defPos={frame.defPos}
          off={frame.off}
          attVisuals={frame.attVisuals}
          rules={state.rules}
          showAll={!!state.showFieldOfViewAll}
          showAllDefenders={!!state.showFieldOfViewAllDefenders}
          showAllAttackers={!!state.showFieldOfViewAllAttackers}
        />
        <HelpLines off={frame.off} defPos={frame.defPos} defenseDistance={state.defenseDistance} show={state.showHelpLines} />
        {/* Anneaux de menace — rendus AVANT les sprites pour que les icônes
            joueur passent par-dessus l'anneau (visuel plus propre). */}
        {threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="rings" />}
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
        {threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="badges" />}
        {state.showBestAction && (() => {
          const carrier = frame.carrier;
          const actions = evaluateOffensiveOptions(frame.off, frame.defPos, carrier, undefined, state.attackerProfiles);
          const best = bestOffensiveAction(actions);
          if (!best) return null;
          return <BestActionOverlay off={frame.off} carrier={carrier} best={best} show />;
        })()}

        {/* ---- Annotations + preview ---- */}
        <g>
          {state.steps[frame.stepIdx]?.annotations
            .map((annotation, index) => ({ annotation, index }))
            .filter(({ annotation }) =>
              isActiveAttacker(annotation.fromId, state.playerCount) &&
              (!annotation.toId || isActiveAttacker(annotation.toId, state.playerCount))
            )
            .map(({ annotation: a, index }) => (
              <g key={index} data-annotation-idx={index} style={{ cursor: 'context-menu' }}>
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

        {/* Poignées d'édition des annotations de mouvement — pause uniquement
            pour ne pas polluer la lecture. L'overlay vit après les annotations
            pour rester au-dessus visuellement (z-order SVG = ordre du DOM). */}
        {!props.isPlaying && state.steps[frame.stepIdx] && (
          <AnnotationHandles
            annotations={state.steps[frame.stepIdx].annotations}
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
          show={!!state.showTacticalMetrics}
        />
        {state.showHelpDebug && <HelpDebugOverlay defPos={frame.defPos} />}
        {state.showScreenDebug && (
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
                annotations: step.annotations.filter(
                  (a) => isActiveAttacker(a.fromId, state.playerCount) &&
                    (!a.toId || isActiveAttacker(a.toId, state.playerCount))
                ),
              }}
            />
          );
        })()}
        <Ball pos={frame.ballPos} inFlight={frame.ballInFlight} />
        {threatData && <ThreatOverlay off={frame.off} threats={threatData} show layer="badges" />}

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

        {/* Halo "passe auto en attente cible" — affiché autour du joueur source
            tant que le user n'a pas cliqué sur la cible (Escape pour annuler). */}
        {pendingAutoSourceId && frame.off[pendingAutoSourceId] && (
          <circle
            cx={frame.off[pendingAutoSourceId].x}
            cy={frame.off[pendingAutoSourceId].y}
            r={PLAYER_RADIUS + 8}
            fill="none"
            stroke="#D85A30"
            strokeWidth={2}
            strokeDasharray="4 3"
            pointerEvents="none"
          >
            <animate attributeName="r" values={`${PLAYER_RADIUS + 6};${PLAYER_RADIUS + 10};${PLAYER_RADIUS + 6}`} dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>

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
          passe auto depuis <b>{pendingAutoSourceId}</b> — clique le receveur (Esc pour annuler)
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
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              cursor: 'pointer',
            }}
            title="Vider la sélection (Esc)"
          >
            ✕
          </button>
        </div>
      )}

      {state.showScreenDebug && (
        <ScreenPlayerDebugPanel frame={frame} selectedDefenders={selectedDefenders} />
      )}

      {state.showPlayerDebug && (
        <PlayerDebugTable frame={frame} visible />
      )}

      {state.showProfileOverlay && (
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
            étape {frame.stepIdx + 1} / {state.steps.length}
            {state.steps[frame.stepIdx]?.label ? ` — ${state.steps[frame.stepIdx].label}` : ''}
          </span>
        </div>
      )}

      {/* ---- Menus contextuels ---- */}
      <CourtMenus
        state={state}
        frame={frame}
        ctxMenu={ctxMenu}
        zoneRegionMenu={zoneRegionMenu}
        onSetTool={props.onSetTool}
        onCloseCtxMenu={closeCtxMenu}
        onCloseZoneRegionMenu={closeZoneRegionMenu}
        onUpdateRule={props.onUpdateRule}
        onApplyDefenderProfile={props.onApplyDefenderProfile}
        onClearDefenseOverride={props.onClearDefenseOverride}
        onSetBallCarrier={props.onSetBallCarrier}
        onSetForcedScreener={props.onSetForcedScreener}
        onClearAnnotationsFor={props.onClearAnnotationsFor}
        onSetAttackerHand={props.onSetAttackerHand}
        onSetAttackerProfile={props.onSetAttackerProfile}
        onSetAttackerOrientation={props.onSetAttackerOrientation}
        onAddAnnotation={props.onAddAnnotation}
        onSetZoneOverride={props.onSetZoneOverride}
        onClearZoneOverride={props.onClearZoneOverride}
      />
    </div>
  );
}
