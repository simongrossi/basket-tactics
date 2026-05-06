import type { AppState, DefenderRules } from '../types';

export interface DefensePreset {
  id: string;
  name: string;
  description: string;
  /** Patch appliqué sur l'AppState. Les `rules` sont mergées par défenseur. */
  patch: Partial<AppState> & { rules?: Partial<DefenderRules> };
}

const DROP_COVERAGE: DefensePreset = {
  id: 'drop-coverage',
  name: 'Drop coverage',
  description: 'Pivot recule en couverture, extérieurs over sur les écrans, aide raquette.',
  patch: {
    defenseSystem: 'man',
    screenRule: 'drop',
    dropDepth: 'medium',
    offBallScreenRule: 'over',
    defenseDistance: 40,
    defenseMaxSpeed: 110,
    triggers: { drive: true, post: true, paint: true },
    rules: {
      D1: { helpPct: 25, priority: 'man', vsCarrier: 'coller', screenNav: 'over' },
      D2: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', screenNav: 'over' },
      D3: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', screenNav: 'over' },
      D4: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper', screenNav: 'drop' },
      D5: { helpPct: 85, priority: 'paint', vsCarrier: 'reculer', screenNav: 'drop' },
    },
  },
};

const SWITCH_ALL: DefensePreset = {
  id: 'switch-all',
  name: 'Switch tout',
  description: 'Tous les défenseurs switchent sur écran (porteur ET non-porteur). Aide réduite.',
  patch: {
    defenseSystem: 'man',
    screenRule: 'switch',
    offBallScreenRule: 'switch',
    defenseDistance: 40,
    defenseMaxSpeed: 130,
    triggers: { drive: false, post: false, paint: true },
    rules: {
      D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', screenNav: 'switch' },
      D2: { helpPct: 25, priority: 'man', vsCarrier: 'coller', screenNav: 'switch' },
      D3: { helpPct: 25, priority: 'man', vsCarrier: 'coller', screenNav: 'switch' },
      D4: { helpPct: 30, priority: 'man', vsCarrier: 'coller', screenNav: 'switch' },
      D5: { helpPct: 35, priority: 'paint', vsCarrier: 'contester', screenNav: 'switch' },
    },
  },
};

const PAINT_PROTECTION: DefensePreset = {
  id: 'paint-protection',
  name: 'Fond de raquette',
  description: 'Priorité absolue à la protection raquette : under sur écrans, gros sag weak-side.',
  patch: {
    defenseSystem: 'man',
    screenRule: 'under',
    offBallScreenRule: 'under',
    defenseDistance: 50,
    defenseMaxSpeed: 110,
    triggers: { drive: true, post: true, paint: true },
    rules: {
      D1: { helpPct: 60, priority: 'paint', vsCarrier: 'reculer', screenNav: 'under' },
      D2: { helpPct: 70, priority: 'paint', vsCarrier: 'reculer', screenNav: 'under' },
      D3: { helpPct: 70, priority: 'paint', vsCarrier: 'reculer', screenNav: 'under' },
      D4: { helpPct: 80, priority: 'paint', vsCarrier: 'bumper', screenNav: 'drop' },
      D5: { helpPct: 90, priority: 'paint', vsCarrier: 'reculer', screenNav: 'drop' },
    },
  },
};

const ALL_COURT_PRESSURE: DefensePreset = {
  id: 'all-court-pressure',
  name: 'Pression all-court',
  description: 'Pression haute, peu d\'aide, blitz sur écran porteur.',
  patch: {
    defenseSystem: 'man',
    screenRule: 'blitz',
    offBallScreenRule: 'over',
    defenseDistance: 28,
    defenseMaxSpeed: 160,
    triggers: { drive: true, post: false, paint: false },
    rules: {
      D1: { helpPct: 15, priority: 'man', vsCarrier: 'coller', screenNav: 'blitz' },
      D2: { helpPct: 20, priority: 'man', vsCarrier: 'coller', screenNav: 'over', offBallStance: 'deny-3q' },
      D3: { helpPct: 20, priority: 'man', vsCarrier: 'coller', screenNav: 'over', offBallStance: 'deny-3q' },
      D4: { helpPct: 30, priority: 'man', vsCarrier: 'contester', screenNav: 'over' },
      D5: { helpPct: 40, priority: 'paint', vsCarrier: 'contester', screenNav: 'hedge' },
    },
  },
};

const HEDGE_RECOVER: DefensePreset = {
  id: 'hedge-recover',
  name: 'Hedge & recover',
  description: 'Show classique : le défenseur du screener montre puis recover sur son homme.',
  patch: {
    defenseSystem: 'man',
    screenRule: 'hedge',
    offBallScreenRule: 'over',
    defenseDistance: 40,
    defenseMaxSpeed: 130,
    triggers: { drive: true, post: false, paint: true },
    rules: {
      D1: { helpPct: 30, priority: 'man', vsCarrier: 'coller', screenNav: 'over' },
      D2: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', screenNav: 'over' },
      D3: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', screenNav: 'over' },
      D4: { helpPct: 60, priority: 'paint', vsCarrier: 'contester', screenNav: 'hedge' },
      D5: { helpPct: 65, priority: 'paint', vsCarrier: 'contester', screenNav: 'hedge' },
    },
  },
};

const ICE_DROP: DefensePreset = {
  id: 'ice-drop',
  name: 'Ice (force baseline) + drop',
  description: 'Force le porteur côté ligne de fond, pivot en drop shallow pour la lecture.',
  patch: {
    defenseSystem: 'man',
    screenRule: 'drop',
    dropDepth: 'shallow',
    offBallScreenRule: 'under',
    defenseDistance: 40,
    defenseMaxSpeed: 120,
    triggers: { drive: true, post: false, paint: true },
    rules: {
      D1: { helpPct: 30, priority: 'man', vsCarrier: 'baseline', screenNav: 'over' },
      D2: { helpPct: 50, priority: 'paint', vsCarrier: 'baseline', screenNav: 'over' },
      D3: { helpPct: 50, priority: 'paint', vsCarrier: 'baseline', screenNav: 'over' },
      D4: { helpPct: 70, priority: 'paint', vsCarrier: 'bumper', screenNav: 'drop' },
      D5: { helpPct: 80, priority: 'paint', vsCarrier: 'reculer', screenNav: 'drop' },
    },
  },
};

export const DEFENSE_PRESETS: DefensePreset[] = [
  DROP_COVERAGE,
  SWITCH_ALL,
  HEDGE_RECOVER,
  ICE_DROP,
  PAINT_PROTECTION,
  ALL_COURT_PRESSURE,
];

export function findDefensePreset(id: string): DefensePreset | undefined {
  return DEFENSE_PRESETS.find((p) => p.id === id);
}
