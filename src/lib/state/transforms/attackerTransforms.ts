// Transformations sur les attaquants : hand, orientation, profil. Toutes pures.

import type {
  AppState,
  AttackerId,
  AttackerProfiles,
  AttackerSpeedTier,
  OffensiveProfile,
} from '@/lib/types';

const DEFAULT_HANDS: Record<AttackerId, 'right' | 'left'> = {
  O1: 'right',
  O2: 'right',
  O3: 'right',
  O4: 'right',
  O5: 'right',
};

const DEFAULT_PROFILES: AttackerProfiles = {
  O1: 'creator',
  O2: 'shooter',
  O3: 'shooter',
  O4: 'rim-roller',
  O5: 'stretch-big',
};

export function setAttackerHand(
  s: AppState,
  oId: AttackerId,
  hand: 'right' | 'left'
): AppState {
  return {
    ...s,
    attackerHands: { ...(s.attackerHands ?? DEFAULT_HANDS), [oId]: hand },
  };
}

export function setAttackerOrientation(
  s: AppState,
  oId: AttackerId,
  patch: { body?: number | undefined; gaze?: number | undefined }
): AppState {
  const cur = s.attackerOrientations?.[oId] ?? {};
  const next = { ...cur, ...patch };
  // Nettoie les clés undefined pour pas garder des champs morts.
  const cleaned: { body?: number; gaze?: number } = {};
  if (typeof next.body === 'number') cleaned.body = next.body;
  if (typeof next.gaze === 'number') cleaned.gaze = next.gaze;
  const allOrientations = { ...(s.attackerOrientations ?? {}) };
  if (Object.keys(cleaned).length === 0) {
    delete allOrientations[oId];
  } else {
    allOrientations[oId] = cleaned;
  }
  return { ...s, attackerOrientations: allOrientations };
}

export function setAttackerProfile(
  s: AppState,
  oId: AttackerId,
  profile: OffensiveProfile
): AppState {
  return {
    ...s,
    attackerProfiles: { ...(s.attackerProfiles ?? DEFAULT_PROFILES), [oId]: profile },
  };
}

/** Phy.O — Définit ou efface le tier athlétique d'un attaquant.
 *  `undefined` supprime la clé du map (= 'standard' effectif). Inputs
 *  non mutés. */
export function setAttackerSpeedTier(
  state: AppState,
  id: AttackerId,
  tier: AttackerSpeedTier | undefined,
): AppState {
  const current = { ...(state.attackerSpeedProfiles ?? {}) };
  if (tier === undefined) {
    delete current[id];
  } else {
    current[id] = tier;
  }
  return { ...state, attackerSpeedProfiles: current };
}
