import type { DefenderRule } from '../types';

/**
 * Profil de comportement individuel pour un défenseur.
 *
 * Complémentaire des `DefensePreset` (qui décrivent un système global) :
 * un profil décrit un *rôle* qu'un seul défenseur joue dans le système
 * (stopper, helper, denier, etc.). Appliqué via merge — seuls les champs
 * que le profil définit sont écrasés, le reste de la règle reste intact
 * (distance custom, maxSpeed individuel, orientation, etc.).
 */
export interface DefenderProfile {
  id: string;
  name: string;
  description: string;
  /** Patch partiel de DefenderRule. Mergé superficiellement. */
  rule: Partial<DefenderRule>;
}

export const DEFENDER_PROFILES: DefenderProfile[] = [
  {
    id: 'stopper',
    name: 'Stopper',
    description: "Lockdown sur le porteur. Pression collante, peu d'aide, denial fort.",
    rule: {
      vsCarrier: 'coller',
      helpPct: 10,
      helpMode: 'passive',
      distance: 28,
      denyAggressiveness: 0.6,
    },
  },
  {
    id: 'helper',
    name: 'Helper raquette',
    description: "Free safety. Aide à fond côté faible, vise toujours le bloc bas.",
    rule: {
      priority: 'paint',
      helpPct: 90,
      offBallStance: 'sag',
      helpMode: 'aggressive',
    },
  },
  {
    id: 'denier',
    name: 'Denier 3pts',
    description: "Coupe la passe vers son homme. Pied dans la ligne, garde longtemps.",
    rule: {
      offBallStance: 'deny-3q',
      denyAggressiveness: 0.85,
      helpPct: 30,
      helpMode: 'passive',
    },
  },
  {
    id: 'fronting',
    name: 'Fronting post',
    description: "Devant le pivot poste bas. Empêche la balle d'entrer en post-up.",
    rule: {
      offBallStance: 'fronting',
      denyAggressiveness: 1,
      helpPct: 20,
    },
  },
  {
    id: 'drop-big',
    name: 'Drop big',
    description: "Pivot lent en couverture profonde. Drop sur écran, recul sous panier.",
    rule: {
      screenNav: 'drop',
      vsCarrier: 'reculer',
      priority: 'paint',
      maxSpeed: 80,
    },
  },
  {
    id: 'switcher',
    name: 'Switcher',
    description: "Échange systématiquement sur tout écran. Reste collé, peu d'aide.",
    rule: {
      screenNav: 'switch',
      vsCarrier: 'coller',
      helpPct: 25,
      helpMode: 'auto',
    },
  },
  {
    id: 'hedger',
    name: 'Hedge & recover',
    description: "Show extérieur sur écran porteur puis revient sur son homme.",
    rule: {
      screenNav: 'hedge',
      vsCarrier: 'contester',
      helpMode: 'auto',
    },
  },
  {
    id: 'ice-baseline',
    name: 'Ice baseline',
    description: "Force le porteur côté ligne de fond. Under sur écran, trap possible.",
    rule: {
      vsCarrier: 'baseline',
      screenNav: 'under',
      priority: 'paint',
    },
  },
  {
    id: 'topside',
    name: 'Topside',
    description: "Force le porteur vers le milieu. Over sur écran, écart latéral.",
    rule: {
      vsCarrier: 'topside',
      screenNav: 'over',
    },
  },
  {
    id: 'ball-hawk',
    name: 'Ball hawk',
    description: "Closeout agressif et contestation tir. Boost vitesse sur réception.",
    rule: {
      vsCarrier: 'contester',
      denyAggressiveness: 0.5,
      closeoutBoost: 1.8,
      helpPct: 20,
    },
  },
];

export function findDefenderProfile(id: string): DefenderProfile | undefined {
  return DEFENDER_PROFILES.find((p) => p.id === id);
}
