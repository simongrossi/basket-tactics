// Transformations transversales : tool, template, import/patch, playerCount.
// Toutes pures (la persistance localStorage est gérée par le hook qui appelle
// ces transforms).

import type { AppState, PlayerCount, PlayerId, Tool } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import type { Template } from '@/lib/data/templates';
import {
  ensureAnnotationsForMovement,
  reconcileMovementAnnotations,
} from '@/lib/logic/migrateAnnotations';
import {
  normalizePlayerCount,
  normalizeStateForPlayerCount,
} from '@/lib/logic/players';

export function setTool(s: AppState, tool: Tool): AppState {
  return { ...s, tool };
}

export function patch(s: AppState, p: Partial<AppState>): AppState {
  return { ...s, ...p };
}

export function setPlayerCount(s: AppState, count: PlayerCount): AppState {
  return normalizeStateForPlayerCount(s, count);
}

export function loadTemplate(s: AppState, template: Template): AppState {
  return {
    ...s,
    steps: reconcileMovementAnnotations(
      ensureAnnotationsForMovement(structuredClone(template.steps), s.playerCount)
    ),
    activeStep: 0,
    defenseInitial: structuredClone(template.defenseInitial),
  };
}

/** Merge un état importé sur les defaults, normalise pour playerCount, migre
 *  les annotations de mouvement. Le caller fournit déjà l'état désérialisé. */
export function importState(next: AppState): AppState {
  const defaults = makeInitialState();
  const merged: AppState = {
    ...defaults,
    ...next,
    zoneConfig: { ...defaults.zoneConfig, ...(next.zoneConfig || {}) },
  };
  const normalized = normalizeStateForPlayerCount(
    merged,
    normalizePlayerCount(merged.playerCount)
  );
  return {
    ...normalized,
    steps: reconcileMovementAnnotations(
      ensureAnnotationsForMovement(
        normalized.steps,
        normalizePlayerCount(normalized.playerCount)
      )
    ),
  };
}

/** Reset complet → état initial. Le caller (hook) se charge de purger le
 *  localStorage avant. */
export function resetAll(): AppState {
  return makeInitialState();
}

/** F.4 — Toggle l'état "disqualifié" d'un joueur. Si déjà DQ, le
 *  libère. Si pas DQ, l'ajoute. */
export function togglePlayerDisqualified(s: AppState, playerId: PlayerId): AppState {
  const dq = s.disqualifiedPlayers ?? [];
  const idx = dq.indexOf(playerId);
  const nextDq =
    idx === -1 ? [...dq, playerId] : dq.filter((id) => id !== playerId);
  return { ...s, disqualifiedPlayers: nextDq.length > 0 ? nextDq : undefined };
}

/** F.4 — Réinitialise la liste des disqualifiés (= début de partie). */
export function clearDisqualified(s: AppState): AppState {
  return { ...s, disqualifiedPlayers: undefined };
}
