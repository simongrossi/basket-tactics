// Règle — Défense vivante / drive (2a). Ré-évalue le cœur pur de
// containment et émet une phrase coach : drive contenu vs ligne ouverte.
// Ne fire que si state.driveContainmentEnabled.

import { activeOffense } from '../../players';
import {
  evaluateDriveContainment,
  containmentSpeed,
} from '../../driveContainment';
import type { CoachDiagnostic, Rule } from '../types';

export const driveContainmentRule: Rule = (ctx) => {
  const { state, stepIdx, carrier, carrierPos, defPos, defenderIds, hoop } = ctx;
  if (!state.driveContainmentEnabled) return [];
  if (stepIdx <= 0) return [];

  const carrierDef = defenderIds.find((dId) => defPos[dId]?.isCarrierDefender);
  if (!carrierDef) return [];

  const prevOff = activeOffense(state.steps[stepIdx - 1].off, state.playerCount);
  const carrierPrev = prevOff[carrier] ?? null;
  const def = defPos[carrierDef];
  const base = state.defenseMaxSpeed;

  const result = evaluateDriveContainment({
    carrier: carrierPos,
    carrierPrev,
    defender: { x: def.x, y: def.y },
    hoop,
    carrierSpeed: containmentSpeed(state.attackerSpeedProfiles?.[carrier], base),
    defenderSpeed: containmentSpeed(state.defenderSpeedProfiles?.[carrierDef], base),
  });

  if (!result.isDriving) return [];

  if (result.level === 'beaten') {
    const out: CoachDiagnostic[] = [{
      id: `drive-open-${carrier}`,
      severity: 'warning',
      message: `Drive de ${carrier} — ligne ouverte (${carrierDef} battu)`,
      tag: 'drive-open',
      defenders: [carrierDef],
      attackers: [carrier],
    }];
    return out;
  }

  const out: CoachDiagnostic[] = [{
    id: `drive-contained-${carrier}`,
    severity: 'good',
    message: `Drive de ${carrier} contenu par ${carrierDef} — ligne coupée`,
    tag: 'drive-contained',
    defenders: [carrierDef],
    attackers: [carrier],
  }];
  return out;
};
