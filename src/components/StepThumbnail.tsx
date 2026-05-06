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
import { effectiveDefensePositions, getMatchupsAt } from '@/lib/logic/engine';
import { detectScreen, detectOffBallScreens } from '@/lib/logic/screens';
import { getZoneLayout } from '@/lib/data/zones';
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

  const height = state.fullCourt ? FULL_COURT_HEIGHT : COURT.height;

  return (
    <svg
      viewBox={`0 0 ${COURT.width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <ArrowMarkers />
      <CourtBackground fullCourt={state.fullCourt} />
      {state.defenseSystem === 'zone' && showDefense && (
        <ZoneOverlay layout={getZoneLayout(state.zoneConfig.type)} show />
      )}
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
                  <Player key={id} id={id} pos={pos} isAttacker />
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
                    facing={step.off[p.matchedTo]}
                  />
                ))}
              {Array.from(screenerIds).map((id) =>
                step.off[id] ? (
                  <Player key={`screener-${id}`} id={id} pos={step.off[id]} isAttacker />
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
    </svg>
  );
}
