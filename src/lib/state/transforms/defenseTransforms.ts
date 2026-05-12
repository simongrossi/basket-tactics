// Transformations sur la défense : règles, profils, presets, système (man/zone),
// switchs, overrides. Toutes pures.

import type {
  AppState,
  DefenderId,
  DefenderPositions,
  DefenderRule,
  DefenseSystem,
  ScreenRule,
} from '@/lib/types';
import { getZoneLayout } from '@/lib/data/zones';
import type { DefensePreset } from '@/lib/data/defensePresets';
import type { DefenderProfile } from '@/lib/data/defenderProfiles';

export function clearDefenseOverride(s: AppState, id: DefenderId): AppState {
  const steps = [...s.steps];
  const cur = { ...steps[s.activeStep] };
  if (cur.defenseOverrides) {
    const { [id]: _omit, ...rest } = cur.defenseOverrides;
    cur.defenseOverrides = Object.keys(rest).length > 0 ? rest : undefined;
  }
  steps[s.activeStep] = cur;
  return { ...s, steps };
}

export function updateRule(s: AppState, dId: DefenderId, patch: Partial<DefenderRule>): AppState {
  return { ...s, rules: { ...s.rules, [dId]: { ...s.rules[dId], ...patch } } };
}

/** Applique un patch à TOUS les défenseurs (utile pour les batchs depuis le
 *  DefensePanel : changer une consigne pour tout le monde en une entrée
 *  d'historique). */
export function updateAllRules(s: AppState, patch: Partial<DefenderRule>): AppState {
  const rules = { ...s.rules };
  (Object.keys(rules) as DefenderId[]).forEach((id) => {
    rules[id] = { ...rules[id], ...patch };
  });
  return { ...s, rules };
}

/** Efface tous les overrides numériques individuels (distance, maxSpeed,
 *  closeoutBoost, denyAggressiveness, screenNav) → tous les défenseurs
 *  retombent sur les valeurs globales. */
export function resetIndividualOverrides(s: AppState): AppState {
  const rules = { ...s.rules };
  (Object.keys(rules) as DefenderId[]).forEach((id) => {
    const r = { ...rules[id] };
    delete r.distance;
    delete r.maxSpeed;
    delete r.closeoutBoost;
    delete r.denyAggressiveness;
    delete r.screenNav;
    rules[id] = r;
  });
  return { ...s, rules };
}

export function applyDefenderProfile(
  s: AppState,
  dId: DefenderId,
  profile: DefenderProfile
): AppState {
  return {
    ...s,
    rules: { ...s.rules, [dId]: { ...s.rules[dId], ...profile.rule } },
  };
}

export function setScreenRule(s: AppState, rule: ScreenRule): AppState {
  const steps = s.steps.map((st) => {
    const copy = { ...st };
    delete copy.switches;
    return copy;
  });
  return { ...s, steps, screenRule: rule };
}

export function resetSwitches(s: AppState): AppState {
  return {
    ...s,
    steps: s.steps.map((st) => {
      const copy = { ...st };
      delete copy.switches;
      return copy;
    }),
  };
}

export function applyDefensePreset(s: AppState, preset: DefensePreset): AppState {
  const { rules: ruleOverrides, ...rest } = preset.patch;
  const mergedRules = ruleOverrides
    ? (Object.keys(s.rules) as DefenderId[]).reduce(
        (acc, dId) => ({
          ...acc,
          [dId]: { ...s.rules[dId], ...(ruleOverrides[dId] ?? {}) },
        }),
        {} as typeof s.rules
      )
    : s.rules;
  return { ...s, ...rest, rules: mergedRules };
}

/** Au changement de système : efface les overrides et snap `defenseInitial`
 *  aux positions du nouveau système. */
export function setDefenseSystem(s: AppState, system: DefenseSystem): AppState {
  const cleanedSteps = s.steps.map((st) => {
    const c = { ...st };
    delete c.defenseOverrides;
    return c;
  });
  let defenseInitial = s.defenseInitial;
  if (system === 'zone') {
    const layout = getZoneLayout(s.zoneConfig.type, s.zoneConfig.verticalOffset ?? 0);
    defenseInitial = {} as DefenderPositions;
    layout.forEach((z) => {
      defenseInitial![z.assignedTo] = { ...z.homePos };
    });
  }
  return { ...s, defenseSystem: system, steps: cleanedSteps, defenseInitial };
}

export function clearAllDefenseOverridesActiveStep(s: AppState): AppState {
  const cur = s.steps[s.activeStep];
  if (!cur?.defenseOverrides || Object.keys(cur.defenseOverrides).length === 0) return s;
  const steps = [...s.steps];
  const next = { ...cur };
  delete next.defenseOverrides;
  steps[s.activeStep] = next;
  return { ...s, steps };
}
