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
  | 'targetZone' | 'screenZone' | 'fromZone'
  | 'chain';

export interface ScriptedActionDefinition {
  type: ScriptedActionType;
  label: string;            // libellé court bouton/liste
  fibaTerm: string;         // terme FIBA d'origine
  description: string;      // 1 ligne explicative
  category: 'écran porteur' | 'écran non-porteur' | 'coupe' | 'combinaison' | 'finition' | 'porteur' | 'replacement' | 'set';
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
    // A11 V1 (2026-05-18) — note de cohérence : ce ScriptedAction est
    // consommé UNIQUEMENT en mode IA / simulateur (match/gameLoop,
    // match/aiPossession, logic/simulator). Il n'est PAS converti en
    // Step persisté. Pour le mode édition coach, utiliser plutôt
    // `Step.shotOutcome` ('made' | 'missed') posé manuellement via
    // StepsPanel, et le setter `addShotReboundStep` pour générer la
    // phase rebond. Les deux mondes sont parallèles : un coach qui
    // édite à la main et le simulateur IA n'interagissent pas.
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

  // =====================================================
  // Tier 2 — Cuts (10)
  // =====================================================
  'flash-cut': {
    type: 'flash-cut', label: 'Flash cut', fibaTerm: 'Flash cut',
    description: 'Coupe courte du poste bas vers le nail / haut poste.',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} fait un flash cut${p.targetZone ? towardsZone(p.targetZone) : ' vers la tête de raquette'}.`,
  },
  'flex-cut': {
    type: 'flex-cut', label: 'Flex cut', fibaTerm: 'Flex cut',
    description: 'Coupe du coin faible vers le poste bas fort, via cross-screen.',
    category: 'coupe',
    requiredParams: ['cutter', 'screener'], optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} fait un flex cut via l'écran de ${fmt(p.screener)}${p.targetZone ? towardsZone(p.targetZone) : ' vers le poste bas fort'}.`,
  },
  'i-cut': {
    type: 'i-cut', label: 'I-cut', fibaTerm: 'I-cut',
    description: 'Périphérie → panier puis ressort vers la périphérie.',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} fait un I-cut${towardsZone(p.targetZone)}.`,
  },
  'popout-cut': {
    type: 'popout-cut', label: 'Popout cut', fibaTerm: 'Popout cut',
    description: 'Coupe directe vers le ballon en sortant d\'un écran.',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone', 'screener'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} popout${towardsZone(p.targetZone)}.`,
  },
  'shallow-cut': {
    type: 'shallow-cut', label: 'Shallow cut', fibaTerm: 'Shallow cut',
    description: 'Coupe descendante du top vers le coin côté fort.',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} fait un shallow cut${p.targetZone ? towardsZone(p.targetZone) : ' vers le corner fort'}.`,
  },
  'ucla-cut': {
    type: 'ucla-cut', label: 'UCLA cut', fibaTerm: 'UCLA cut',
    description: 'Coupe du top vers le poste bas en utilisant un écran haut poste.',
    category: 'coupe',
    requiredParams: ['cutter', 'screener'], optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} UCLA cut sur écran de ${fmt(p.screener)}${towardsZone(p.targetZone)}.`,
  },
  'v-cut': {
    type: 'v-cut', label: 'V-cut', fibaTerm: 'V-cut',
    description: 'Démarquage en V (vers panier puis ressort).',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} V-cut pour se démarquer${towardsZone(p.targetZone)}.`,
  },
  'l-cut': {
    type: 'l-cut', label: 'L-cut', fibaTerm: 'L-cut',
    description: 'Démarquage en L (changement de direction à 90°).',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} L-cut${towardsZone(p.targetZone)}.`,
  },
  'banana-cut': {
    type: 'banana-cut', label: 'Banana cut', fibaTerm: 'Banana cut',
    description: 'Coupe en arc (banane) vers le panier.',
    category: 'coupe',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} banana cut${p.targetZone ? towardsZone(p.targetZone) : ' vers le panier'}.`,
  },
  'iverson-cut': {
    type: 'iverson-cut', label: 'Iverson cut', fibaTerm: 'Iverson cut',
    description: 'Coupe horizontale entre 2 écrans haut poste (action à 3 joueurs).',
    category: 'coupe',
    requiredParams: ['cutter', 'firstScreener', 'secondScreener'],
    optionalParams: ['targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} Iverson cut entre ${fmt(p.firstScreener)} et ${fmt(p.secondScreener)}${towardsZone(p.targetZone)}.`,
  },

  // =====================================================
  // Tier 2 — Off-ball screens (7)
  // =====================================================
  'staggered-screen': {
    type: 'staggered-screen', label: 'Staggered screen', fibaTerm: 'Staggered screen',
    description: '2 écrans non adjacents pour le même cutter.',
    category: 'écran non-porteur',
    requiredParams: ['cutter', 'firstScreener', 'secondScreener'],
    optionalParams: ['targetZone'],
    stepsGenerated: 3,
    reader: (p) => `${fmt(p.cutter)} utilise un stagger (${fmt(p.firstScreener)} + ${fmt(p.secondScreener)})${p.targetZone ? towardsZone(p.targetZone) : ' vers la tête de raquette'}.`,
  },
  'elevator-screen': {
    type: 'elevator-screen', label: 'Elevator screen', fibaTerm: 'Elevator / Gate screen',
    description: '2 screeners se referment derrière le cutter.',
    category: 'écran non-porteur',
    requiredParams: ['cutter', 'firstScreener', 'secondScreener'],
    optionalParams: ['targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.cutter)} passe entre ${fmt(p.firstScreener)} et ${fmt(p.secondScreener)} qui referment l'ascenseur${towardsZone(p.targetZone)}.`,
  },
  'hammer-screen': {
    type: 'hammer-screen', label: 'Hammer screen', fibaTerm: 'Hammer screen',
    description: 'Écran côté faible pendant un drive baseline.',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un hammer screen côté faible pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'ram-screen': {
    type: 'ram-screen', label: 'RAM screen', fibaTerm: 'RAM screen',
    description: 'Pré-écran sur le futur poseur du PnR.',
    category: 'écran non-porteur',
    requiredParams: ['firstScreener', 'secondScreener', 'ballHandler'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.firstScreener)} pose un RAM sur ${fmt(p.secondScreener)} qui monte poser le PnR pour ${fmt(p.ballHandler)}.`,
  },
  'wide-screen': {
    type: 'wide-screen', label: 'Wide screen', fibaTerm: 'Wide screen',
    description: 'Cross-screen haut, loin du panier.',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone', 'screenZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un wide screen pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'wiper-screen': {
    type: 'wiper-screen', label: 'Wiper screen', fibaTerm: 'Wiper screen',
    description: 'Flare puis pin-down avec le même poseur (essuie-glace).',
    category: 'écran non-porteur',
    requiredParams: ['screener', 'cutter'],
    optionalParams: ['targetZone'],
    stepsGenerated: 3,
    reader: (p) => `${fmt(p.screener)} pose un wiper (flare + pin-down) pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },
  'screen-away': {
    type: 'screen-away', label: 'Screen away', fibaTerm: 'Screen away',
    description: 'Passer dans une direction, écran posé dans l\'autre.',
    category: 'écran non-porteur',
    requiredParams: ['passer', 'receiver', 'screener', 'cutter'],
    optionalParams: ['targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.passer)} passe à ${fmt(p.receiver)} puis ${fmt(p.screener)} pose un écran pour ${fmt(p.cutter)}${towardsZone(p.targetZone)}.`,
  },

  // =====================================================
  // Tier 2 — PnR variants (5)
  // =====================================================
  slip: {
    type: 'slip', label: 'Slip', fibaTerm: 'Slip',
    description: 'Le screener coupe vers le panier avant le contact.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side', 'targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} feinte l'écran et slip${p.targetZone ? towardsZone(p.targetZone) : ' vers le panier'}.`,
  },
  reject: {
    type: 'reject', label: 'Reject', fibaTerm: 'Reject',
    description: 'Le porteur refuse l\'écran et attaque l\'autre côté.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side', 'targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.ballHandler)} refuse l'écran de ${fmt(p.screener)} et attaque côté opposé${towardsZone(p.targetZone)}.`,
  },
  'drag-screen': {
    type: 'drag-screen', label: 'Drag screen', fibaTerm: 'Drag screen',
    description: 'PnR en transition, porteur dribble vers l\'axe.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} pose un drag screen pour ${fmt(p.ballHandler)} en transition.`,
  },
  'step-up-screen': {
    type: 'step-up-screen', label: 'Step-up screen', fibaTerm: 'Step-up screen',
    description: 'PnR vs ICE — porteur va vers la baseline.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side'],
    stepsGenerated: 3,
    reader: (p) => `${fmt(p.screener)} pose un step-up sur ${fmt(p.ballHandler)} (le pousse baseline).`,
  },
  'ghost-screen': {
    type: 'ghost-screen', label: 'Ghost screen', fibaTerm: 'Ghost screen',
    description: 'PnR fictif : le screener simule puis coupe.',
    category: 'écran porteur',
    requiredParams: ['screener', 'ballHandler'],
    optionalParams: ['side', 'targetZone'],
    stepsGenerated: 2,
    reader: (p) => `${fmt(p.screener)} simule un écran (ghost) puis coupe${p.targetZone ? towardsZone(p.targetZone) : ' vers le panier'}.`,
  },

  // =====================================================
  // Tier 2 — Combinations (5)
  // =====================================================
  'zoom-action': {
    type: 'zoom-action', label: 'Zoom action', fibaTerm: 'Zoom action',
    description: 'Pin-down enchaîné avec un dribble hand-off (pin-down + DHO).',
    category: 'combinaison',
    requiredParams: ['screener', 'cutter', 'giver'],
    optionalParams: ['targetZone'],
    stepsGenerated: 3,
    reader: (p) => `Zoom : ${fmt(p.screener)} pin-down pour ${fmt(p.cutter)} puis DHO de ${fmt(p.giver)}${towardsZone(p.targetZone)}.`,
  },
  'rip-dho': {
    type: 'rip-dho', label: 'Rip DHO', fibaTerm: 'Rip DHO',
    description: 'Back-screen suivi d\'un DHO.',
    category: 'combinaison',
    requiredParams: ['screener', 'cutter', 'giver'],
    optionalParams: ['targetZone'],
    stepsGenerated: 3,
    reader: (p) => `Rip-DHO : ${fmt(p.screener)} back-screen pour ${fmt(p.cutter)} puis DHO de ${fmt(p.giver)}.`,
  },
  'slide-action': {
    type: 'slide-action', label: 'Slide action', fibaTerm: 'Slide action',
    description: 'Cut côté faible vers le dunker spot opposé + roll.',
    category: 'combinaison',
    requiredParams: ['cutter', 'screener'],
    optionalParams: ['targetZone'],
    stepsGenerated: 2,
    reader: (p) => `Slide action : ${fmt(p.cutter)} coupe vers le dunker faible, ${fmt(p.screener)} roll${towardsZone(p.targetZone)}.`,
  },
  'split-action': {
    type: 'split-action', label: 'Split action', fibaTerm: 'Split action',
    description: 'Passe au poste bas + écran extérieur entre les arrières.',
    category: 'combinaison',
    requiredParams: ['passer', 'receiver', 'screener', 'cutter'],
    stepsGenerated: 2,
    reader: (p) => `Split : ${fmt(p.passer)} passe à ${fmt(p.receiver)} au poste, ${fmt(p.screener)} pose un écran pour ${fmt(p.cutter)}.`,
  },
  'high-low-action': {
    type: 'high-low-action', label: 'High-low action', fibaTerm: 'High-low action',
    description: 'Pivot bas reçoit du haut poste.',
    category: 'combinaison',
    requiredParams: ['from', 'to'],
    stepsGenerated: 1,
    reader: (p) => `High-low : ${fmt(p.from)} (haut poste) passe à ${fmt(p.to)} (bas poste).`,
  },
  'ball-reversal': {
    type: 'ball-reversal',
    label: 'Renversement (ball reversal)',
    fibaTerm: 'Ball reversal',
    description: 'Le ballon traverse une chaîne de passes (swing guard-to-guard).',
    category: 'combinaison',
    requiredParams: ['chain'],
    stepsGenerated: 2,
    reader: (p) => `Renversement : ${(p.chain ?? []).join(' → ') || '—'} (passes).`,
  },
  'dho-chain': {
    type: 'dho-chain',
    label: 'Chaîne de DHO',
    fibaTerm: 'DHO chain',
    description: 'Hand-offs enchaînés : le ballon passe de main en main le long d\'une chaîne.',
    category: 'combinaison',
    requiredParams: ['chain'],
    stepsGenerated: 2,
    reader: (p) => `Chaîne DHO : ${(p.chain ?? []).join(' → ') || '—'}.`,
  },

  // =====================================================
  // Tier 2 — Replacements (3)
  // =====================================================
  drift: {
    type: 'drift', label: 'Drift', fibaTerm: 'Drift',
    description: 'Replacement vers la ligne de fond pendant un drive du porteur.',
    category: 'replacement',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} drift${p.targetZone ? towardsZone(p.targetZone) : ' vers le corner'}.`,
  },
  lift: {
    type: 'lift', label: 'Lift', fibaTerm: 'Lift',
    description: 'Replacement vers le top pendant un drive baseline.',
    category: 'replacement',
    requiredParams: ['cutter'], optionalParams: ['targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} lift${p.targetZone ? towardsZone(p.targetZone) : ' vers le top of the key'}.`,
  },
  replacement: {
    type: 'replacement', label: 'Replacement', fibaTerm: 'Replacement',
    description: 'Replacement libre vers une zone après cut/passe.',
    category: 'replacement',
    requiredParams: ['cutter', 'targetZone'],
    stepsGenerated: 1,
    reader: (p) => `${fmt(p.cutter)} se replace${towardsZone(p.targetZone)}.`,
  },

  // =====================================================
  // Tier 3 — Sets / entrées de jeu
  // =====================================================
  // Chaque set génère un step "alignement" qui place les 5 attaquants
  // dans la formation typique. Les actions signature sont laissées au coach
  // (à empiler après le set via les actions Tier 1/2).
  'horns-set': {
    type: 'horns-set', label: 'Horns', fibaTerm: 'Horns set',
    description: 'Formation 1-2-2 : meneur top, 2 ailes, 2 grands aux coudes.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Horns (1-2-2 — meneur, ailes, coudes).',
  },
  'floppy-set': {
    type: 'floppy-set', label: 'Floppy', fibaTerm: 'Floppy action',
    description: 'Meneur top, 2 ailes baseline (corners), 2 grands haut poste.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Floppy (meneur top, tireurs baseline, grands haut poste).',
  },
  'pistol-set': {
    type: 'pistol-set', label: 'Pistol', fibaTerm: 'Pistol offense',
    description: 'Set d\'entrée arrière-arrière en transition (PnR/DHO entre meneur et arrière).',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Pistol (entrée transition arrière-arrière).',
  },
  'ucla-set': {
    type: 'ucla-set', label: 'UCLA set', fibaTerm: 'UCLA set',
    description: 'Alignement 1-3-1 + UCLA cut du meneur.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement UCLA (1-3-1 — UCLA cut du meneur sur écran haut poste).',
  },
  'iverson-set': {
    type: 'iverson-set', label: 'Iverson set', fibaTerm: 'Iverson set',
    description: 'Alignement avec 2 grands aux coudes, meneur passe entre les deux.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Iverson (2 grands aux coudes, meneur traverse).',
  },
  'diamond-set': {
    type: 'diamond-set', label: 'Diamond', fibaTerm: 'Diamond offense',
    description: 'Formation en losange : 1 top, 2 mi-distance, 1 bas du poste.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Diamond (losange).',
  },
  'chicago-set': {
    type: 'chicago-set', label: 'Chicago action', fibaTerm: 'Chicago action',
    description: 'DHO + pin-down enchaînés (action signature des Bulls).',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Chicago (DHO + pin-down).',
  },
  'loop-set': {
    type: 'loop-set', label: 'Loop set', fibaTerm: 'Loop set',
    description: 'Cutter qui boucle autour de 2 écrans pour libérer un tir.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement Loop (cutter loop autour de 2 écrans).',
  },
  'america-set': {
    type: 'america-set', label: 'America set', fibaTerm: 'America set',
    description: 'Set d\'entrée à 5 joueurs avec triple écran.',
    category: 'set',
    requiredParams: [],
    stepsGenerated: 1,
    reader: () => 'Alignement America (triple écran).',
  },
};

export const SCRIPTED_ACTIONS_BY_CATEGORY = (Object.values(SCRIPTED_ACTIONS_CATALOG) as ScriptedActionDefinition[])
  .reduce<Record<string, ScriptedActionDefinition[]>>((acc, def) => {
    (acc[def.category] ||= []).push(def);
    return acc;
  }, {});

export const ALL_SCRIPTED_ACTION_TYPES: ScriptedActionType[] =
  Object.keys(SCRIPTED_ACTIONS_CATALOG) as ScriptedActionType[];
