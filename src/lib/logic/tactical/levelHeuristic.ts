import type { Point } from '../../types';
import {
  buildSpacingGraph,
  totalSpacing,
  avgPairwiseDistance,
  maxPairwiseDistance,
  convexHull,
  polygonArea,
} from './spacingGraph';

export type SpacingLevel = 'grappe' | 'comete' | 'etalement' | 'expert';

export interface SpacingReport {
  totalSpacing: number;
  avgPairwise: number;
  ejeArea: number;
  diameter: number;
  level: SpacingLevel;
}

/** Diamètre (plus longue paire) en dessous duquel l'équipe est en grappe. */
export const GRAPPE_MAX_DIAMETER = 80;
/** Ratio aire/diamètre² en dessous duquel la forme est jugée allongée (comète). */
export const COMETE_MAX_AREA_TO_DIAM2 = 0.2;
/** Distance moyenne minimale pour qualifier un placement d'expert. */
export const EXPERT_MIN_AVG = 110;

export function evaluateSpacing(
  players: Record<string, Point>,
): SpacingReport {
  const g = buildSpacingGraph(players);
  const tot = totalSpacing(g);
  const avg = avgPairwiseDistance(g);
  const diameter = maxPairwiseDistance(g);
  const hull = convexHull(Object.values(players));
  const ejeArea = polygonArea(hull);

  let level: SpacingLevel;
  if (diameter < GRAPPE_MAX_DIAMETER) {
    level = 'grappe';
  } else if (
    diameter > 0 &&
    ejeArea / (diameter * diameter) < COMETE_MAX_AREA_TO_DIAM2
  ) {
    level = 'comete';
  } else if (avg >= EXPERT_MIN_AVG) {
    level = 'expert';
  } else {
    level = 'etalement';
  }

  return { totalSpacing: tot, avgPairwise: avg, ejeArea, diameter, level };
}
