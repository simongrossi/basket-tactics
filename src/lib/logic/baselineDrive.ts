import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '../types';
import { distance, pointToSegmentDistance } from './geometry';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from './players';
import { effectiveDefensePositions, getDefenseHoop } from './engine';

/**
 * Détecteur "attaque ligne de fond".
 *
 * Étape 1 du chantier "concepts défensifs avancés" : on détecte UNIQUEMENT,
 * sans modifier les positions défensives. Le résultat alimente
 * coachDiagnostics et pourra être réutilisé en Étape 2 par une couche
 * baselineCloseLayer dans le moteur (engine.ts).
 *
 * Géométrie (coordonnées SVG, panier en haut, baseline = y bas) :
 *  - bande baseline : verticalFromHoop = |carrier.y - hoop.y| < 80 px
 *  - couloir latéral : 95 < |carrier.x - hoop.x| < 260 (entre raquette et corner 3pt)
 *  - phase 'driving' : mouvement vers le panier sur la dernière étape
 *  - phase 'static'  : posté sans bouger dans la zone
 *
 * "Closer" = défenseur le plus proche du segment carrier→panier (perp distance).
 * C'est lui qui doit "fermer la ligne". S'il est loin (> 70 px) ou en retard,
 * la ligne est ouverte.
 *
 * Architecture : la fonction principale `detectBaselineDrive(state, step)` est
 * un wrapper qui résout les positions effectives puis délègue à la fonction
 * pure `detectBaselineDriveFromPositions(...)`. Les tests unitaires exercent
 * la version pure, ce qui évite les variations dues au moteur de placement.
 */

const BASELINE_BAND_VERT_PX = 80;
const BASELINE_LATERAL_MIN_PX = 95;
const BASELINE_LATERAL_MAX_PX = 260;
const UNCOVERED_PERP_PX = 70;
const DRIVING_DLATERAL_PX = 15;
const DRIVING_DHOOP_PX = 20;
const STATIC_DHOOP_MAX_PX = 180;
const PAINT_HELPER_DHOOP_MAX_PX = 100;

export interface BaselineDriveContext {
  carrier: AttackerId;
  side: -1 | 1;
  pos: Point;
  phase: 'driving' | 'static';
  distToHoop: number;
  /** Plus proche défenseur du couloir d'attaque carrier→panier. */
  closer: { id: DefenderId; perpDist: number; late: boolean } | null;
  /** 2ᵉ plus proche, futur candidat à l'aide raquette. */
  second: { id: DefenderId; perpDist: number } | null;
  /** Défenseurs déjà rentrés dans la zone restreinte (aide paint). */
  paintHelpers: DefenderId[];
  uncovered: boolean;
}

export interface BaselineDefenderInput {
  x: number;
  y: number;
  late?: boolean;
}

/**
 * Variante pure : prend les positions déjà résolues. Utilisée par les tests
 * unitaires et par le wrapper d'état ci-dessous.
 */
export function detectBaselineDriveFromPositions(
  carrier: AttackerId,
  carrierPos: Point,
  prevCarrierPos: Point | null,
  hoop: Point,
  defPositions: Record<string, BaselineDefenderInput>
): BaselineDriveContext | null {
  const lateral = Math.abs(carrierPos.x - hoop.x);
  const verticalFromHoop = Math.abs(carrierPos.y - hoop.y);

  const inBaselineBand =
    verticalFromHoop < BASELINE_BAND_VERT_PX &&
    lateral > BASELINE_LATERAL_MIN_PX &&
    lateral < BASELINE_LATERAL_MAX_PX;
  if (!inBaselineBand) return null;

  const distToHoop = distance(carrierPos, hoop);
  const side: -1 | 1 = carrierPos.x < hoop.x ? -1 : 1;

  let phase: 'driving' | 'static' | null = null;
  if (prevCarrierPos) {
    const prevLateral = Math.abs(prevCarrierPos.x - hoop.x);
    const prevDHoop = distance(prevCarrierPos, hoop);
    const dLateral = prevLateral - lateral;
    const dHoop = prevDHoop - distToHoop;
    if (dLateral > DRIVING_DLATERAL_PX || dHoop > DRIVING_DHOOP_PX) {
      phase = 'driving';
    }
  }
  if (!phase && distToHoop < STATIC_DHOOP_MAX_PX) {
    phase = 'static';
  }
  if (!phase) return null;

  const defenderIds = Object.keys(defPositions) as DefenderId[];
  const ranked = defenderIds
    .map((id) => {
      const d = defPositions[id];
      return {
        id,
        perpDist: pointToSegmentDistance({ x: d.x, y: d.y }, carrierPos, hoop),
        late: d.late === true,
      };
    })
    .sort((a, b) => a.perpDist - b.perpDist);

  const closer = ranked[0] ?? null;
  const second = ranked[1] ? { id: ranked[1].id, perpDist: ranked[1].perpDist } : null;

  const paintHelpers = defenderIds.filter((id) => {
    const d = defPositions[id];
    return distance({ x: d.x, y: d.y }, hoop) < PAINT_HELPER_DHOOP_MAX_PX;
  });

  const uncovered =
    closer === null || closer.perpDist > UNCOVERED_PERP_PX || closer.late;

  return {
    carrier,
    side,
    pos: carrierPos,
    phase,
    distToHoop,
    closer,
    second,
    paintHelpers,
    uncovered,
  };
}

export function detectBaselineDrive(
  state: AppState,
  stepIdx: number
): BaselineDriveContext | null {
  const cur = state.steps[stepIdx];
  if (!cur) return null;
  const off: AttackerPositions = activeOffense(cur.off, state.playerCount);
  const carrier: AttackerId = activeBallCarrier(cur, state.playerCount);
  const carrierPos = off[carrier];
  if (!carrierPos) return null;

  const hoop = getDefenseHoop(state);
  const prevCarrierPos =
    stepIdx > 0
      ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount)[carrier] ?? null
      : null;

  const defPos: ComputedDefense = effectiveDefensePositions(state, stepIdx);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const defPositions: Record<string, BaselineDefenderInput> = {};
  defenderIds.forEach((id) => {
    const d = defPos[id];
    defPositions[id] = { x: d.x, y: d.y, late: d.late === true };
  });

  return detectBaselineDriveFromPositions(carrier, carrierPos, prevCarrierPos, hoop, defPositions);
}
