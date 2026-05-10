// Catalogue des 18 actions FIBA Tier 1 disponibles dans le mode scénario.
// Source : "FIBA Europe — Terminologie du Basketball" (2025).
// Chaque entrée décrit l'action côté UI : libellé FR, description, catégorie,
// paramètres requis et template de lecture FR. Le code de génération vit dans
// /lib/logic/scriptedGenerators/<type>.ts.

import type { ScriptedActionType, ScriptedActionParams, AttackerId } from '@/lib/types';
import { COURT_ZONES, isAbsoluteZone, isRelativeZone, type ZoneRef } from '@/lib/data/courtZones';

export type ParamKind =
  | 'ballHandler' | 'screener' | 'cutter' | 'passer' | 'receiver'
  | 'giver' | 'driver' | 'shooter' | 'from' | 'to'
  | 'firstScreener' | 'secondScreener'
  | 'side' | 'direction'
  | 'targetZone' | 'screenZone' | 'fromZone';

export interface ScriptedActionDefinition {
  type: ScriptedActionType;
  label: string;            // libellé court bouton/liste
  fibaTerm: string;         // terme FIBA d'origine
  description: string;      // 1 ligne explicative
  category: 'écran porteur' | 'écran non-porteur' | 'coupe' | 'combinaison' | 'finition' | 'porteur';
  /** Paramètres requis (sélecteurs joueurs / côté). Ordre = ordre dans le formulaire. */
  requiredParams: ParamKind[];
  /** Paramètres optionnels avec valeur par défaut. */
  optionalParams?: ParamKind[];
  /** Nombre de steps générés (pour afficher dans l'UI). */
  stepsGenerated: number;
  /** Lecture FR de l'action (ex : "{screener} pose un pick-and-roll sur {ballHandler} côté {side}"). */
  reader: (p: ScriptedActionParams) => string;
}

// Helpers de formatage pour la lecture FR.
const fmt = (id: AttackerId | undefined) => id ?? '?';
const fmtSide = (s?: string) => s ?? 'axe';

/** Lecture FR d'une référence de zone (absolue ou relative au porteur).
 *  Renvoie une chaîne vide si la zone n'est pas définie — facilite la
 *  composition dans les `reader` ("...vers {zone}"). */
const fmtZone = (z?: ZoneRef): string => {
  if (!z) return '';
  if (isAbsoluteZone(z)) return COURT_ZONES[z].label.toLowerCase();
  if (isRelativeZone(z)) {
    // Format "wing-strong" / "short-corner-weak" → "aile fort" / "short corner faible".
    // On utilise le label de la version "left" comme base FIBA puis on appose fort/faible.
    const isStrong = z.endsWith('-strong');
    const baseId = z.replace(/-strong|-weak$/, '-left') as keyof typeof COURT_ZONES;
    const def = COURT_ZONES[baseId];
    if (!def) return z;
    // Retire le suffixe G/D du label si présent.
    const baseLabel = def.label.replace(/\s*[GD]$/, '').toLowerCase();
    return `${baseLabel} ${isStrong ? 'fort' : 'faible'}`;
  }
  return z;
};

/** Helper "vers la {zone}" — vide si zone absente, espace devant sinon. */
const towardsZone = (z?: ZoneRef): string => (z ? ` vers ${fmtZone(z)}` : '');

export const SCRIPTED_ACTIONS_CATALOG: Record<ScriptedActionType, ScriptedActionDefinition> = {
  'pick-and-roll': {
    type: 'pick-and-roll',
    label: 'Pick-and-roll',
    fibaTerm: 'Pick-and-roll',
    description: 'Écran sur le porteur, le poseur plonge ensuite vers le panier.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side'],
    stepsGenerated: 3,
    reader: (p) => `${fmt(p.screener)} pose un pick-and-roll sur ${fmt(p.ballHandler)} côté ${fmtSide(p.side)}.`,
  },
  'pick-and-pop': {
    type: 'pick-and-pop',
    label: 'Pick-and-pop',
    fibaTerm: 'Pick-and-pop',
    description: 'Écran sur le porteur puis le poseur s\'écarte vers la ligne 3pts.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side'],
    stepsGenerated: 3,
    reader: (p) => `${fmt(p.screener)} pose un pick-and-pop sur ${fmt(p.ballHandler)} côté ${fmtSide(p.side)}.`,
  },
  'hand-off': {
    type: 'hand-off',
    label: 'Hand-off (DHO)',
    fibaTerm: 'Dribble hand-off (DHO)',
    description: 'Le porteur dribble vers un coéquipier et lui remet la balle main-en-main.',
    category: 'écran porteur',
    requiredParams: ['giver', 'receiver'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.giver)} fait un hand-off à ${fmt(p.receiver)}.`,
  },
  'give-and-go': {
    type: 'give-and-go',
    label: 'Give-and-go',
    fibaTerm: 'Give-and-go',
    description: 'Le porteur passe puis coupe vers le panier pour recevoir en retour.',
    category: 'combinaison',
    requiredParams: ['passer', 'cutter'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.passer)} passe à ${fmt(p.cutter)} puis coupe vers le panier (give-and-go).`,
  },
  'basket-cut': {
    type: 'basket-cut',
    label: 'Coupe panier',
    fibaTerm: 'Basket cut',
    description: 'Coupe directe vers le panier.',
    category: 'coupe',
    requiredParams: ['cutter'],
    optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} coupe${p.targetZone ? towardsZone(p.targetZone) : ' vers le panier'}.`,
  },
  'backdoor-cut': {
    type: 'backdoor-cut',
    label: 'Coupe backdoor',
    fibaTerm: 'Backdoor cut',
    description: 'S\'éloigne du panier puis coupe soudainement derrière le défenseur.',
    category: 'coupe',
    requiredParams: ['cutter'],
    optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} coupe en backdoor derrière la défense${towardsZone(p.targetZone)}.`,
  },
  'flare-cut': {
    type: 'flare-cut',
    label: 'Coupe flare (fade)',
    fibaTerm: 'Flare cut / Fade cut',
    description: 'Coupe qui éloigne du ballon, en utilisant un écran flare.',
    category: 'coupe',
    requiredParams: ['cutter', 'screener'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} coupe en flare via l\'écran de ${fmt(p.screener)}${towardsZone(p.targetZone)}.`,
  },
  'curl-cut': {
    type: 'curl-cut',
    label: 'Coupe curl',
    fibaTerm: 'Curl cut',
    description: 'Coupe enroulée autour d\'un écran vers le panier.',
    category: 'coupe',
    requiredParams: ['cutter', 'screener'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} curl autour de l\'écran de ${fmt(p.screener)}${p.targetZone ? towardsZone(p.targetZone) : ' vers le panier'}.`,
  },
  'shuffle-cut': {
    type: 'shuffle-cut',
    label: 'Coupe shuffle',
    fibaTerm: 'Shuffle cut',
    description: 'Coupe autour d\'un écran du haut du poste vers le panier.',
    category: 'coupe',
    requiredParams: ['cutter', 'screener'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} fait un shuffle cut sur écran de ${fmt(p.screener)}${towardsZone(p.targetZone)}.`,
  },
  'pin-down': {
    type: 'pin-down',
    label: 'Pin-down (down screen)',
    fibaTerm: 'Down screen / Pin Down',
    description: 'Écran descendant pour libérer un tireur.',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un pin-down pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'flare-screen': {
    type: 'flare-screen',
    label: 'Écran flare',
    fibaTerm: 'Flare screen',
    description: 'Écran latéral pour un joueur qui s\'éloigne du ballon.',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un écran flare pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'back-screen': {
    type: 'back-screen',
    label: 'Back screen',
    fibaTerm: 'Back screen / Rip screen / Blindside',
    description: 'Écran dans le dos du défenseur du cutter (cutter coupe vers le panier).',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un back-screen pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'cross-screen': {
    type: 'cross-screen',
    label: 'Cross screen',
    fibaTerm: 'Cross screen',
    description: 'Écran horizontal d\'une position post-bas à l\'autre.',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un cross-screen pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'screen-the-screener': {
    type: 'screen-the-screener',
    label: 'Screen the screener (StS)',
    fibaTerm: 'Screen the screener',
    description: 'Le poseur d\'écran reçoit lui-même un écran après son action.',
    category: 'combinaison',
    requiredParams: ['firstScreener', 'secondScreener', 'cutter'],
    stepsGenerated: 3,
    reader: (p) => `${fmt(p.firstScreener)} pose un écran pour ${fmt(p.cutter)}, puis reçoit un écran de ${fmt(p.secondScreener)}.`,
  },
  drive: {
    type: 'drive',
    label: 'Drive',
    fibaTerm: 'Drive',
    description: 'Pénétration agressive vers le panier en dribble.',
    category: 'porteur',
    requiredParams: ['driver'],
    optionalParams: ['direction', 'targetZone'],
    stepsGenerated: 1,
    reader: (p) => {
      if (p.targetZone) return `${fmt(p.driver)} attaque${towardsZone(p.targetZone)}.`;
      return `${fmt(p.driver)} attaque le panier${p.direction ? ` (${p.direction})` : ''}.`;
    },
  },
  pass: {
    type: 'pass',
    label: 'Passe',
    fibaTerm: 'Pass',
    description: 'Passe simple d\'un joueur à un autre.',
    category: 'porteur',
    requiredParams: ['from', 'to'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.from)} passe à ${fmt(p.to)}.`,
  },
  'kick-out': {
    type: 'kick-out',
    label: 'Kick-out',
    fibaTerm: 'Kick-out / Extra pass',
    description: 'Passe extérieure (typiquement après pénétration) vers un joueur démarqué.',
    category: 'porteur',
    requiredParams: ['from', 'to'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.from)} fait un kick-out pour ${fmt(p.to)}.`,
  },
  shoot: {
    type: 'shoot',
    label: 'Tir',
    fibaTerm: 'Shoot / Finish',
    description: 'Le porteur prend son tir (clôture le scénario).',
    category: 'finition',
    requiredParams: ['shooter'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.shooter)} prend son tir.`,
  },
  isolation: {
    type: 'isolation',
    label: 'Isolation',
    fibaTerm: 'Isolation play / Iso',
    description: 'Les autres joueurs s\'écartent pour laisser un 1c1 au porteur.',
    category: 'porteur',
    requiredParams: ['driver'],
    stepsGenerated: 1,
    reader: (p) => `Isolation pour ${fmt(p.driver)}.`,
  },
};

export const SCRIPTED_ACTIONS_BY_CATEGORY = (Object.values(SCRIPTED_ACTIONS_CATALOG) as ScriptedActionDefinition[])
  .reduce<Record<string, ScriptedActionDefinition[]>>((acc, def) => {
    (acc[def.category] ||= []).push(def);
    return acc;
  }, {});

export const ALL_SCRIPTED_ACTION_TYPES: ScriptedActionType[] =
  Object.keys(SCRIPTED_ACTIONS_CATALOG) as ScriptedActionType[];
