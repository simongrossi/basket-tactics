// Resolver du profil de réalisme cinématique.
//
// Source de vérité unique : le moteur ne lit JAMAIS les flags cinématiques
// bruts directement (frameResolver, speedConstraint, useCourtFrame passent
// par ici). Pur, déterministe, sans mutation.
//
// Scope = cinématique déterministe uniquement. Les comportements RNG
// (physicsRebounds, activeInterceptions, dribblePhysics), le contact, la
// transition et realSpeedMode ne sont PAS gérés ici (lus bruts ailleurs).

import type { AppState } from '../types';

/** Valeurs du preset réaliste. Calibrées en Task 8. */
export const PRESET_REALISTIC = {
  attackerAccelerationEnabled: true,
  attackerAcceleration: 5.0,
  attackerMomentumEnabled: true,
  attackerMomentum: 0.15,
  attackerVelocityProfileEnabled: true,
  footworkRulesEnabled: true,
  // Réalisme défensif (2026-09-22) : congestion en trafic (P3.3), départ
  // progressif en lecture (P3.1 + poursuite V4) et poursuite anticipée (P3.5).
  congestionPenaltyEnabled: true,
  defenderPlaybackAccelerationEnabled: true,
  defenderLeadPursuitEnabled: true,
  // Audit réalisme 2026-09-27 : cinématique en m/s / m/s² et tempo calculé
  // selon la distance à courir.
  physicalKinematicsEnabled: true,
  distanceTempoEnabled: true,
} as const;

export interface ResolvedRealismFlags {
  attackerAccelerationEnabled: boolean;
  attackerAcceleration: number | undefined;
  attackerMomentumEnabled: boolean;
  attackerMomentum: number | undefined;
  attackerVelocityProfileEnabled: boolean;
  footworkRulesEnabled: boolean;
  congestionPenaltyEnabled: boolean;
  defenderPlaybackAccelerationEnabled: boolean;
  defenderLeadPursuitEnabled: boolean;
  physicalKinematicsEnabled: boolean;
  distanceTempoEnabled: boolean;
}

export function resolveRealismFlags(state: AppState): ResolvedRealismFlags {
  if (state.realismProfile === 'realistic') {
    // `?? preset` : un flag absent prend le preset, un flag explicitement
    // posé (même `false`) l'emporte (override coach).
    return {
      attackerAccelerationEnabled:
        state.attackerAccelerationEnabled ?? PRESET_REALISTIC.attackerAccelerationEnabled,
      attackerAcceleration:
        state.attackerAcceleration ?? PRESET_REALISTIC.attackerAcceleration,
      attackerMomentumEnabled:
        state.attackerMomentumEnabled ?? PRESET_REALISTIC.attackerMomentumEnabled,
      attackerMomentum: state.attackerMomentum ?? PRESET_REALISTIC.attackerMomentum,
      attackerVelocityProfileEnabled:
        state.attackerVelocityProfileEnabled ?? PRESET_REALISTIC.attackerVelocityProfileEnabled,
      footworkRulesEnabled:
        state.footworkRulesEnabled ?? PRESET_REALISTIC.footworkRulesEnabled,
      congestionPenaltyEnabled:
        state.congestionPenaltyEnabled ?? PRESET_REALISTIC.congestionPenaltyEnabled,
      defenderPlaybackAccelerationEnabled:
        state.defenderPlaybackAccelerationEnabled ?? PRESET_REALISTIC.defenderPlaybackAccelerationEnabled,
      defenderLeadPursuitEnabled:
        state.defenderLeadPursuitEnabled ?? PRESET_REALISTIC.defenderLeadPursuitEnabled,
      physicalKinematicsEnabled:
        state.physicalKinematicsEnabled ?? PRESET_REALISTIC.physicalKinematicsEnabled,
      distanceTempoEnabled:
        state.distanceTempoEnabled ?? PRESET_REALISTIC.distanceTempoEnabled,
    };
  }
  // legacy / undefined — flags bruts, bit-identiques au comportement actuel.
  return {
    attackerAccelerationEnabled: !!state.attackerAccelerationEnabled,
    attackerAcceleration: state.attackerAcceleration,
    attackerMomentumEnabled: !!state.attackerMomentumEnabled,
    attackerMomentum: state.attackerMomentum,
    attackerVelocityProfileEnabled: !!state.attackerVelocityProfileEnabled,
    footworkRulesEnabled: !!state.footworkRulesEnabled,
    congestionPenaltyEnabled: !!state.congestionPenaltyEnabled,
    defenderPlaybackAccelerationEnabled: !!state.defenderPlaybackAccelerationEnabled,
    defenderLeadPursuitEnabled: !!state.defenderLeadPursuitEnabled,
    physicalKinematicsEnabled: !!state.physicalKinematicsEnabled,
    distanceTempoEnabled: !!state.distanceTempoEnabled,
  };
}
