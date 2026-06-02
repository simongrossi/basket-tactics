// Persistance localStorage de l'AppState. SSR-safe : toute fonction qui
// touche `window` court-circuite si `typeof window === 'undefined'`.
//
// Convention :
// - `loadFromStorage()` lit, valide, et migre (scriptedActions +
//   playerCount + annotations) avant de rendre un AppState complet.
// - `saveToStorage(state)` écrit la version sérialisée brute. La couche
//   debounced vit dans le hook appelant.
// - `clearStorage()` retire l'entrée (utilisé par `resetAll`).

import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { migrateScriptedActions } from '@/lib/logic/scriptedActionMigration';
import { normalizePlayerCount, normalizeStateForPlayerCount } from '@/lib/logic/players';
import {
  ensureAnnotationsForMovement,
  reconcileMovementAnnotations,
} from '@/lib/logic/migrateAnnotations';

export const STORAGE_KEY = 'basket-tactics-state-v1';

/** Migration du profil de réalisme à l'ouverture.
 *
 *  - Scénario POST-feature (`realismProfile` présent) : respecté tel quel
 *    (les flags cinématiques sont des overrides coach délibérés).
 *  - Scénario PRÉ-feature (`realismProfile` absent) : homogénéisé en
 *    `'realistic'`. Les flags cinématiques avaient le défaut legacy `false`
 *    sérialisé ; on les efface pour que `resolveRealismFlags` applique le
 *    preset réaliste (un `false` résiduel serait pris pour un override). */
function migrateRealismProfile(parsed: Partial<AppState>): Partial<AppState> {
  if (parsed.realismProfile !== undefined) return parsed;
  const {
    attackerAccelerationEnabled: _accel,
    attackerMomentumEnabled: _momentum,
    attackerVelocityProfileEnabled: _velocity,
    footworkRulesEnabled: _footwork,
    ...rest
  } = parsed;
  return { ...rest, realismProfile: 'realistic' };
}

export function loadFromStorage(): AppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = migrateRealismProfile(JSON.parse(raw) as Partial<AppState>);
    const defaults = makeInitialState();
    const scriptedActions = parsed.scriptedActions
      ? migrateScriptedActions(parsed.scriptedActions as unknown[])
      : parsed.scriptedActions;
    const merged = {
      ...defaults,
      ...parsed,
      zoneConfig: { ...defaults.zoneConfig, ...(parsed.zoneConfig || {}) },
      scriptedActions,
    } as AppState;
    const normalized = normalizeStateForPlayerCount(merged, normalizePlayerCount(merged.playerCount));
    return {
      ...normalized,
      steps: reconcileMovementAnnotations(
        ensureAnnotationsForMovement(normalized.steps, normalizePlayerCount(normalized.playerCount))
      ),
    };
  } catch {
    return null;
  }
}

export function saveToStorage(state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded ou navigation privée — ignore */
  }
}

export function clearStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
