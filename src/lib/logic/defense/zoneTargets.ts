// Couche zone du calcul défensif. Calcule les cibles "idéales" des défenseurs
// en mode zone : ownership polygonal, glissement bonus côté ballon, tracking
// d'attaquant (matchedTo).
//
// Sort un record {dId → DefenderTarget} et un Matchups, exactement comme la
// couche man (cf. engine.ts). Pas de contrainte de vitesse à ce niveau —
// `effectiveDefensePositions` s'en charge en aval.

import type { AppState, DefenderId, Matchups } from '../../types';
import { applyZoneOverrides, getZoneLayout, mirrorZoneLayout } from '../../data/zones';
import { computeDefenderOrientation } from '../orientation';
import { computeZoneTargets } from '../zoneDefense';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';
import type { DefenderTarget } from './types';
import { computeMatchupZoneTargets } from './matchupZone';
import { applyZoneSituationRules } from './zoneSituationRules';

export function computeZoneDefenseTargets(
  state: AppState,
  stepIdx: number
): { positions: Record<DefenderId, DefenderTarget>; matchupsApplied: Matchups } {
  // Zone matchup : appariement un-pour-un avec passage de relais (moteur
  // dédié, cf. matchupZone.ts), pas l'ownership continu des autres zones.
  if (state.zoneConfig.type === 'zone-matchup') return computeMatchupZoneTargets(state, stepIdx);
  const cur = state.steps[stepIdx];
  const off = activeOffense(cur.off, state.playerCount);
  const ballCarrier = activeBallCarrier(cur, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);
  const baseLayout = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
  // En mode attack 'down', miroite le layout autour de la médiane pour que
  // les zones soient devant le panier protégé (bas).
  const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(baseLayout) : baseLayout;
  // Applique les overrides utilisateur (homePos déplacés, radius, mode) après
  // l'orientation pour rester invariant au sens d'attaque.
  const layout = applyZoneOverrides(oriented, state.zoneOverrides).filter((z) =>
    defenderIds.includes(z.assignedTo)
  );
  const prevStep = stepIdx > 0 ? state.steps[stepIdx - 1] : null;
  const prevOff = prevStep ? activeOffense(prevStep.off, state.playerCount) : null;
  const zoneTargets = computeZoneTargets(
    off, ballCarrier, layout, state.zoneConfig, state.defenseDistance, hoop, prevOff
  );

  const positions = {} as Record<DefenderId, DefenderTarget>;
  const matchups = {} as Matchups;

  const carrierPosZone = off[ballCarrier];
  defenderIds.forEach((dId) => {
    const zt = zoneTargets[dId];
    const trackedAttacker = zt?.trackedAttacker || ballCarrier;
    matchups[dId] = trackedAttacker;
    const x = zt?.x ?? state.defenseInitial[dId].x;
    const y = zt?.y ?? state.defenseInitial[dId].y;
    const att = off[trackedAttacker];
    // En zone, tout le monde regarde le ballon (principe de base) ; le
    // tracking d'un attaquant est secondaire. On reflète ça via stance="sag"
    // (head-on-swivel) qui produit facing = midpoint(homme, ballon), ce qui
    // est en pratique très proche du ballon quand le défenseur n'est pas
    // collé à un homme.
    const orient = computeDefenderOrientation({
      defenderPos: { x, y },
      manPos: att ?? { x, y },
      ballPos: carrierPosZone ?? { x, y },
      isCarrierDefender: trackedAttacker === ballCarrier,
      stance: 'sag',
      manualDelta: state.rules[dId]?.orientation ?? 0,
      manualBody: state.rules[dId]?.bodyOrientation,
      bodyMode: state.rules[dId]?.bodyOrientationMode,
      gazeLock: state.rules[dId]?.gazeLock,
    });
    positions[dId] = {
      x,
      y,
      helpFactor: 0,
      isCarrierDefender: trackedAttacker === ballCarrier,
      matchedTo: trackedAttacker,
      onScreen: false,
      switchedThisStep: false,
      orientation: orient.bodyOrientation,
      gazeOrientation: orient.gazeOrientation,
      facing: orient.facing,
      armBallSide: orient.armBallSide,
      armManSide: orient.armManSide,
    };
  });

  // Règles par situation (coin, poste haut, aile) des zones 3-2, 2-3 et
  // 1-3-1 (cf. zone32Rotation.ts et zoneSituationRules.ts). Ballon au
  // sommet : moteur générique.
  {
    const moved = applyZoneSituationRules({
      type: state.zoneConfig.type,
      positions, layout, off, ballCarrier, hoop, defenseDistance: state.defenseDistance,
      cornerRotation: state.zoneConfig.cornerRotation,
    });
    moved.forEach((dId) => {
      const t = positions[dId];
      matchups[dId] = t.matchedTo;
      const orient = computeDefenderOrientation({
        defenderPos: { x: t.x, y: t.y },
        manPos: off[t.matchedTo] ?? { x: t.x, y: t.y },
        ballPos: carrierPosZone ?? { x: t.x, y: t.y },
        isCarrierDefender: t.isCarrierDefender,
        stance: 'sag',
        manualDelta: state.rules[dId]?.orientation ?? 0,
        manualBody: state.rules[dId]?.bodyOrientation,
        bodyMode: state.rules[dId]?.bodyOrientationMode,
        gazeLock: state.rules[dId]?.gazeLock,
      });
      t.orientation = orient.bodyOrientation;
      t.gazeOrientation = orient.gazeOrientation;
      t.facing = orient.facing;
      t.armBallSide = orient.armBallSide;
      t.armManSide = orient.armManSide;
    });
  }

  return { positions, matchupsApplied: matchups };
}
