'use client';

import { actionsOfStep } from '@/lib/logic/stepActions';
import type {
  AppState,
  AttackerId,
  DefenderId,
  ComputedDefense,
  Point,
} from '@/lib/types';
import { CourtBackground, ArrowMarkers } from './Court';
import { Player, Ball } from './Player';
import { AnnotationView } from './Annotations';
import { ActionOrderBadges } from './overlays/ActionOrderBadges';
import { effectiveDefensePositions, getMatchupsAt, computeAttackerVisuals } from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import { ZoneOverlay } from './overlays/MatchupAndScreenOverlays';
import { COURT, FULL_COURT_HEIGHT } from '@/lib/data/court';
import {
  activeBallCarrier,
  activeOffense,
  getActiveDefenderIds,
  isActiveAttacker,
} from '@/lib/logic/players';
import { hasShotOutcome } from '@/lib/logic/shotTracking';

interface StepThumbnailProps {
  state: AppState;
  stepIdx: number;
  showDefense?: boolean;
}

/**
 * Rendu statique non-interactif d'une étape — utilisé pour l'export playbook.
 */
export function StepThumbnail({ state, stepIdx, showDefense = true }: StepThumbnailProps) {
  const step = state.steps[stepIdx];
  if (!step) return null;
  const off = activeOffense(step.off, state.playerCount);
  const carrier = activeBallCarrier(step, state.playerCount);
  // Actions qui partent de l'étape (le ballon est encore chez le passeur).
  const visibleAnnotations = actionsOfStep(state.steps, stepIdx).map(({ annotation }) => annotation).filter(
    (a) => isActiveAttacker(a.fromId, state.playerCount) && (!a.toId || isActiveAttacker(a.toId, state.playerCount))
  );
  const defPos: ComputedDefense = showDefense
    ? effectiveDefensePositions(state, stepIdx)
    : ({} as ComputedDefense);
  const attVisuals = computeAttackerVisuals(state, stepIdx);

  const height = state.fullCourt ? FULL_COURT_HEIGHT : COURT.height;

  return (
    <svg
      viewBox={`0 0 ${COURT.width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <ArrowMarkers />
      <CourtBackground fullCourt={state.fullCourt} attackingDirection={state.attackingDirection} />
      {state.defenseSystem === 'zone' && showDefense && (() => {
        const activeDefenders = new Set(getActiveDefenderIds(state.playerCount));
        const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
        const layout = (state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base)
          .filter((z) => activeDefenders.has(z.assignedTo));
        return <ZoneOverlay layout={layout} show />;
      })()}
      <g>
        {(() => {
          const screenerIds = new Set<AttackerId>();
          if (showDefense && state.defenseSystem === 'man') {
            const matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
            const defPositions = Object.fromEntries(
              (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p]) => [
                id,
                { x: p.x, y: p.y },
              ])
            ) as Record<DefenderId, Point>;
            const screen = detectScreen(off, carrier, matchups, defPositions, state.screenRadius);
            const offBallScreens = detectOffBallScreens(off, carrier, matchups, defPositions, state.screenRadius);
            if (screen?.screener) screenerIds.add(screen.screener);
            offBallScreens.forEach((s) => screenerIds.add(s.screener));
          }
          return (
            <>
              {(Object.entries(off) as [AttackerId, Point][])
                .filter(([id]) => !screenerIds.has(id))
                .map(([id, pos]) => (
                  <Player
                    key={id}
                    id={id}
                    pos={pos}
                    isAttacker
                    orientation={attVisuals[id]?.orientation}
                    gazeOrientation={attVisuals[id]?.gazeOrientation}
                    facing={attVisuals[id]?.facing}
                    armBallSide={attVisuals[id]?.armBallSide}
                    armManSide={attVisuals[id]?.armManSide}
                    isCarrier={id === carrier}
                    isShooting={id === carrier && hasShotOutcome(step)}
                    dominantHand={state.attackerHands?.[id] ?? 'right'}
                    isActivelyDribbling={attVisuals[id]?.isActivelyDribbling}
                    isPostShotRecovery={attVisuals[id]?.isPostShotRecovery}
                    name={state.playerNames?.[id]}
                    number={state.playerNumbers?.[id]}
                    showName={state.showPlayerNames !== false}
                  />
                ))}
              {showDefense &&
                (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p]) => (
                  <Player
                    key={id}
                    id={id}
                    pos={p}
                    isAttacker={false}
                    isCarrierDefender={p.isCarrierDefender}
                    onScreen={p.onScreen}
                    screenPhase={p.screenPhase}
                    facing={p.facing}
                    orientation={p.orientation}
                    gazeOrientation={p.gazeOrientation}
                    armBallSide={p.armBallSide}
                    armManSide={p.armManSide}
                    name={state.playerNames?.[id]}
                    number={state.playerNumbers?.[id]}
                    showName={state.showPlayerNames !== false}
                  />
                ))}
              {Array.from(screenerIds).map((id) =>
                off[id] ? (
                  <Player
                    key={`screener-${id}`}
                    id={id}
                    pos={off[id]}
                    isAttacker
                    orientation={attVisuals[id]?.orientation}
                    gazeOrientation={attVisuals[id]?.gazeOrientation}
                    facing={attVisuals[id]?.facing}
                    armBallSide={attVisuals[id]?.armBallSide}
                    armManSide={attVisuals[id]?.armManSide}
                    isCarrier={id === carrier}
                    isShooting={id === carrier && hasShotOutcome(step)}
                    isScreening
                    dominantHand={state.attackerHands?.[id] ?? 'right'}
                    isActivelyDribbling={attVisuals[id]?.isActivelyDribbling}
                    isPostShotRecovery={attVisuals[id]?.isPostShotRecovery}
                    name={state.playerNames?.[id]}
                    number={state.playerNumbers?.[id]}
                    showName={state.showPlayerNames !== false}
                  />
                ) : null
              )}
            </>
          );
        })()}
      </g>
      <g>
        {visibleAnnotations.map((a, i) => (
          <AnnotationView key={i} annotation={a} />
        ))}
      </g>
      <Ball carrierPos={off[carrier]} />
      <ActionOrderBadges step={{ ...step, off, ballCarrier: carrier, annotations: visibleAnnotations }} />
    </svg>
  );
}
