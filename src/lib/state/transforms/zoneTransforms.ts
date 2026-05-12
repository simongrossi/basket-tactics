// Transformations sur les zones (overrides régionaux + zoneConfig).
// Toutes pures.

import type { AppState, DefenderPositions, ZoneConfig, ZoneRegionOverride } from '@/lib/types';
import { getZoneLayout } from '@/lib/data/zones';

export function setZoneOverride(
  s: AppState,
  regionId: string,
  override: Partial<ZoneRegionOverride>
): AppState {
  const cur = s.zoneOverrides?.[regionId] ?? {};
  const merged = { ...cur, ...override };
  const hasValue =
    merged.homePos !== undefined || merged.radius !== undefined || merged.mode !== undefined;
  const next = { ...(s.zoneOverrides ?? {}) };
  if (hasValue) next[regionId] = merged;
  else delete next[regionId];
  return { ...s, zoneOverrides: Object.keys(next).length ? next : undefined };
}

export function clearZoneOverride(s: AppState, regionId: string): AppState {
  if (!s.zoneOverrides?.[regionId]) return s;
  const next = { ...s.zoneOverrides };
  delete next[regionId];
  return { ...s, zoneOverrides: Object.keys(next).length ? next : undefined };
}

export function setZoneEditMode(s: AppState, on: boolean): AppState {
  return { ...s, zoneEditMode: on };
}

/** Patch sur la zoneConfig. Si le TYPE de zone change, on resnap
 *  `defenseInitial` aux nouveaux homePos et on efface tous les overrides
 *  (defense step + régions) car les ids de région diffèrent entre formations. */
export function updateZoneConfig(s: AppState, zPatch: Partial<ZoneConfig>): AppState {
  const newConfig = { ...s.zoneConfig, ...zPatch };
  let next: AppState = { ...s, zoneConfig: newConfig };
  if (zPatch.type && zPatch.type !== s.zoneConfig.type) {
    const layout = getZoneLayout(newConfig.type, newConfig.verticalOffset ?? 0);
    const newDefenseInitial = {} as DefenderPositions;
    layout.forEach((z) => {
      newDefenseInitial[z.assignedTo] = { ...z.homePos };
    });
    const cleanedSteps = s.steps.map((st) => {
      const c = { ...st };
      delete c.defenseOverrides;
      return c;
    });
    next = {
      ...next,
      defenseInitial: newDefenseInitial,
      steps: cleanedSteps,
      zoneOverrides: undefined,
    };
  }
  return next;
}
