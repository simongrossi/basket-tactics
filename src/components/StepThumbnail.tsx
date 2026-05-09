'use client';

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
import { ActionOrderBadges } from './ActionOrderBadges';
import { effectiveDefensePositions, getMatchupsAt, computeAttackerVisuals } from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import { getZoneLayout, mirrorZoneLayout } from '@/lib/data/zones';
import { ZoneOverlay } from './Overlays';
import { COURT, FULL_COURT_HEIGHT } from '@/lib/data/court';

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
        const base = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
        const layout = state.attackingDirection === 'down' ? mirrorZoneLayout(base) : base;
        return <ZoneOverlay layout={layout} show />;
      })()}
      <g>
        {(() => {
          const screenerIds = new Set<AttackerId>();
          if (showDefense && state.defenseSystem === 'man') {
            const matchups = getMatchupsAt(state.steps, stepIdx - 1);
            const defPositions = Object.fromEntries(
              (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(([id, p]) => [
                id,
                { x: p.x, y: p.y },
              ])
            ) as Record<DefenderId, Point>;
            const screen = detectScreen(step.off, step.ballCarrier, matchups, defPositions, state.screenRadius);
            const offBallScreens = detectOffBallScreens(step.off, step.ballCarrier, matchups, defPositions, state.screenRadius);
            if (screen?.screener) screenerIds.add(screen.screener);
            offBallScreens.forEach((s) => screenerIds.add(s.screener));
          }
          return (
            <>
              {(Object.entries(step.off) as [AttackerId, Point][])
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
                    facing={p.facing}
                    orientation={p.orientation}
                    gazeOrientation={p.gazeOrientation}
                    armBallSide={p.armBallSide}
                    armManSide={p.armManSide}
                  />
                ))}
              {Array.from(screenerIds).map((id) =>
                step.off[id] ? (
                  <Player
                    key={`screener-${id}`}
                    id={id}
                    pos={step.off[id]}
                    isAttacker
                    orientation={attVisuals[id]?.orientation}
                    gazeOrientation={attVisuals[id]?.gazeOrientation}
                    facing={attVisuals[id]?.facing}
                    armBallSide={attVisuals[id]?.armBallSide}
                    armManSide={attVisuals[id]?.armManSide}
                  />
                ) : null
              )}
            </>
          );
        })()}
      </g>
      <g>
        {step.annotations.map((a, i) => (
          <AnnotationView key={i} annotation={a} />
        ))}
      </g>
      <Ball carrierPos={step.off[step.ballCarrier]} />
      <ActionOrderBadges step={step} />
    </svg>
  );
}

