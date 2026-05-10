// Catalogue des zones nommées du terrain (vocabulaire FIBA / NBA).
// Permet aux actions du mode scénario de référencer une destination
// (cutter, screener, replacement) par un nom métier — "short corner fort",
// "wing faible", "nail" — au lieu de coordonnées en dur.
//
// Référentiel : repère SVG du Court (cf. court.ts).
//   - Baseline en haut (y = 20)
//   - HOOP à (300, 75)
//   - Mid-line à y = 540
//   - x = 0 (touche gauche) ... 600 (touche droite)
//
// Side conventions :
//   - "left" / "right" = côté gauche / droite du terrain (x < 300 / x > 300).
//   - "strong" / "weak" = côté du porteur de balle (résolu au compile).

import type { Point } from '../types';

export type ZoneCategory = 'coin' | 'aile' | 'poste' | 'axe' | 'transition';

export type AbsoluteZoneId =
  | 'corner-left' | 'corner-right'
  | 'short-corner-left' | 'short-corner-right'
  | 'dunker-spot-left' | 'dunker-spot-right'
  | 'low-block-left' | 'low-block-right'
  | 'mid-post-left' | 'mid-post-right'
  | 'high-post-left' | 'high-post-right'
  | 'nail'
  | 'wing-left' | 'wing-right'
  | 'slot-left' | 'slot-right'
  | 'top-of-key'
  | 'point-guard-spot'
  | 'logo'
  | 'sideline-left' | 'sideline-right'
  | 'midline-center';

export type RelativeZoneId =
  | 'corner-strong' | 'corner-weak'
  | 'short-corner-strong' | 'short-corner-weak'
  | 'dunker-spot-strong' | 'dunker-spot-weak'
  | 'low-block-strong' | 'low-block-weak'
  | 'mid-post-strong' | 'mid-post-weak'
  | 'high-post-strong' | 'high-post-weak'
  | 'wing-strong' | 'wing-weak'
  | 'slot-strong' | 'slot-weak'
  | 'sideline-strong' | 'sideline-weak';

export type ZoneRef = AbsoluteZoneId | RelativeZoneId;

export type BallSide = 'left' | 'right';

export interface ZoneDefinition {
  id: AbsoluteZoneId;
  label: string;     // libellé court FR pour UI
  fibaTerm: string;  // terme FIBA d'origine
  category: ZoneCategory;
  point: Point;
  /** Zone miroir (côté opposé) — défini pour les zones latéralisées. */
  mirror?: AbsoluteZoneId;
  /** Description courte FR pour tooltip / aide. */
  description?: string;
}

// =============================================================
// Catalogue absolu (1 entrée par côté G/D quand pertinent)
// =============================================================
export const COURT_ZONES: Record<AbsoluteZoneId, ZoneDefinition> = {
  // Coin 3pts
  'corner-left': {
    id: 'corner-left', label: 'Corner G', fibaTerm: 'Corner', category: 'coin',
    point: { x: 53, y: 80 }, mirror: 'corner-right',
    description: '3pts dans le coin, côté gauche.',
  },
  'corner-right': {
    id: 'corner-right', label: 'Corner D', fibaTerm: 'Corner', category: 'coin',
    point: { x: 547, y: 80 }, mirror: 'corner-left',
    description: '3pts dans le coin, côté droit.',
  },

  // Short corner (entre paint et corner, sur la baseline)
  'short-corner-left': {
    id: 'short-corner-left', label: 'Short corner G', fibaTerm: 'Short corner', category: 'coin',
    point: { x: 170, y: 55 }, mirror: 'short-corner-right',
    description: 'Sur la baseline, entre la raquette et le corner 3pts (côté G).',
  },
  'short-corner-right': {
    id: 'short-corner-right', label: 'Short corner D', fibaTerm: 'Short corner', category: 'coin',
    point: { x: 430, y: 55 }, mirror: 'short-corner-left',
    description: 'Sur la baseline, entre la raquette et le corner 3pts (côté D).',
  },

  // Dunker spot (NBA — juste hors raquette, près baseline)
  'dunker-spot-left': {
    id: 'dunker-spot-left', label: 'Dunker spot G', fibaTerm: 'Dunker spot', category: 'poste',
    point: { x: 195, y: 90 }, mirror: 'dunker-spot-right',
    description: 'Hors raquette, près baseline, pour finition (côté G).',
  },
  'dunker-spot-right': {
    id: 'dunker-spot-right', label: 'Dunker spot D', fibaTerm: 'Dunker spot', category: 'poste',
    point: { x: 405, y: 90 }, mirror: 'dunker-spot-left',
    description: 'Hors raquette, près baseline, pour finition (côté D).',
  },

  // Low block (1er marquage raquette, dans la peinture)
  'low-block-left': {
    id: 'low-block-left', label: 'Poste bas G', fibaTerm: 'Low block', category: 'poste',
    point: { x: 225, y: 95 }, mirror: 'low-block-right',
    description: 'Premier marquage de la raquette (côté G).',
  },
  'low-block-right': {
    id: 'low-block-right', label: 'Poste bas D', fibaTerm: 'Low block', category: 'poste',
    point: { x: 375, y: 95 }, mirror: 'low-block-left',
    description: 'Premier marquage de la raquette (côté D).',
  },

  // Mid post (mi-poste, sur le bord paint)
  'mid-post-left': {
    id: 'mid-post-left', label: 'Mi-poste G', fibaTerm: 'Mid post', category: 'poste',
    point: { x: 225, y: 165 }, mirror: 'mid-post-right',
    description: 'Mi-poste sur le bord raquette (côté G).',
  },
  'mid-post-right': {
    id: 'mid-post-right', label: 'Mi-poste D', fibaTerm: 'Mid post', category: 'poste',
    point: { x: 375, y: 165 }, mirror: 'mid-post-left',
    description: 'Mi-poste sur le bord raquette (côté D).',
  },

  // High post / Elbow (coude raquette = jonction LF + bord paint)
  'high-post-left': {
    id: 'high-post-left', label: 'Coude G (elbow)', fibaTerm: 'High post / Elbow', category: 'poste',
    point: { x: 225, y: 235 }, mirror: 'high-post-right',
    description: 'Coude de la raquette, intersection LF (côté G).',
  },
  'high-post-right': {
    id: 'high-post-right', label: 'Coude D (elbow)', fibaTerm: 'High post / Elbow', category: 'poste',
    point: { x: 375, y: 235 }, mirror: 'high-post-left',
    description: 'Coude de la raquette, intersection LF (côté D).',
  },

  // Nail (sommet raquette, axe central — terme NBA)
  nail: {
    id: 'nail', label: 'Tête de raquette (nail)', fibaTerm: 'Nail', category: 'axe',
    point: { x: 300, y: 235 },
    description: 'Sommet de la raquette sur l\'axe central (face au panier).',
  },

  // Wing (aile, à 45° du panier, sur ou juste hors arc)
  'wing-left': {
    id: 'wing-left', label: 'Aile G', fibaTerm: 'Wing', category: 'aile',
    point: { x: 120, y: 260 }, mirror: 'wing-right',
    description: 'À 45° du panier, sur l\'arc 3pts (côté G).',
  },
  'wing-right': {
    id: 'wing-right', label: 'Aile D', fibaTerm: 'Wing', category: 'aile',
    point: { x: 480, y: 260 }, mirror: 'wing-left',
    description: 'À 45° du panier, sur l\'arc 3pts (côté D).',
  },

  // Slot (entre aile et top, ~22-25°)
  'slot-left': {
    id: 'slot-left', label: 'Slot G', fibaTerm: 'Slot', category: 'aile',
    point: { x: 220, y: 310 }, mirror: 'slot-right',
    description: 'Entre l\'aile et la tête de raquette, sur l\'arc (côté G).',
  },
  'slot-right': {
    id: 'slot-right', label: 'Slot D', fibaTerm: 'Slot', category: 'aile',
    point: { x: 380, y: 310 }, mirror: 'slot-left',
    description: 'Entre l\'aile et la tête de raquette, sur l\'arc (côté D).',
  },

  // Axe panier-panier (top of key, point guard, logo)
  'top-of-key': {
    id: 'top-of-key', label: 'Top of the key', fibaTerm: 'Top of the key', category: 'axe',
    point: { x: 300, y: 330 },
    description: 'Sommet de l\'arc 3pts, axe panier-panier.',
  },
  'point-guard-spot': {
    id: 'point-guard-spot', label: 'Position meneur', fibaTerm: 'Point guard spot', category: 'axe',
    point: { x: 300, y: 420 },
    description: 'Position de meneur, au-delà de l\'arc, axe central.',
  },
  logo: {
    id: 'logo', label: 'Logo (centre)', fibaTerm: 'Logo', category: 'axe',
    point: { x: 300, y: 470 },
    description: 'Centre du terrain, près du rond central, axe panier-panier.',
  },

  // Transition / touches
  'sideline-left': {
    id: 'sideline-left', label: 'Touche G', fibaTerm: 'Sideline', category: 'transition',
    point: { x: 35, y: 400 }, mirror: 'sideline-right',
    description: 'Près de la touche gauche, en zone arrière haute.',
  },
  'sideline-right': {
    id: 'sideline-right', label: 'Touche D', fibaTerm: 'Sideline', category: 'transition',
    point: { x: 565, y: 400 }, mirror: 'sideline-left',
    description: 'Près de la touche droite, en zone arrière haute.',
  },
  'midline-center': {
    id: 'midline-center', label: 'Ligne médiane', fibaTerm: 'Mid-line', category: 'transition',
    point: { x: 300, y: 540 },
    description: 'Centre de la ligne médiane.',
  },
};

// =============================================================
// Index par catégorie (pour dropdown UI)
// =============================================================
export const ZONES_BY_CATEGORY: Record<ZoneCategory, ZoneDefinition[]> =
  (Object.values(COURT_ZONES) as ZoneDefinition[]).reduce((acc, def) => {
    (acc[def.category] ||= []).push(def);
    return acc;
  }, {} as Record<ZoneCategory, ZoneDefinition[]>);

export const ALL_ABSOLUTE_ZONE_IDS: AbsoluteZoneId[] =
  Object.keys(COURT_ZONES) as AbsoluteZoneId[];

// =============================================================
// Zones relatives (côté fort / faible vis-à-vis du porteur)
// =============================================================
// Mapping (relative, ballSide) → AbsoluteZoneId
// ballSide = côté du porteur ('left' = porteur côté G du terrain).
// strong = même côté que le porteur, weak = côté opposé.
const RELATIVE_TO_ABSOLUTE: Record<RelativeZoneId, { left: AbsoluteZoneId; right: AbsoluteZoneId }> = {
  'corner-strong':       { left: 'corner-left',       right: 'corner-right' },
  'corner-weak':         { left: 'corner-right',      right: 'corner-left' },
  'short-corner-strong': { left: 'short-corner-left', right: 'short-corner-right' },
  'short-corner-weak':   { left: 'short-corner-right', right: 'short-corner-left' },
  'dunker-spot-strong':  { left: 'dunker-spot-left',  right: 'dunker-spot-right' },
  'dunker-spot-weak':    { left: 'dunker-spot-right', right: 'dunker-spot-left' },
  'low-block-strong':    { left: 'low-block-left',    right: 'low-block-right' },
  'low-block-weak':      { left: 'low-block-right',   right: 'low-block-left' },
  'mid-post-strong':     { left: 'mid-post-left',     right: 'mid-post-right' },
  'mid-post-weak':       { left: 'mid-post-right',    right: 'mid-post-left' },
  'high-post-strong':    { left: 'high-post-left',    right: 'high-post-right' },
  'high-post-weak':      { left: 'high-post-right',   right: 'high-post-left' },
  'wing-strong':         { left: 'wing-left',         right: 'wing-right' },
  'wing-weak':           { left: 'wing-right',        right: 'wing-left' },
  'slot-strong':         { left: 'slot-left',         right: 'slot-right' },
  'slot-weak':           { left: 'slot-right',        right: 'slot-left' },
  'sideline-strong':     { left: 'sideline-left',     right: 'sideline-right' },
  'sideline-weak':       { left: 'sideline-right',    right: 'sideline-left' },
};

export const ALL_RELATIVE_ZONE_IDS: RelativeZoneId[] =
  Object.keys(RELATIVE_TO_ABSOLUTE) as RelativeZoneId[];

const ABSOLUTE_ZONE_ID_SET: ReadonlySet<string> = new Set(ALL_ABSOLUTE_ZONE_IDS);
const RELATIVE_ZONE_ID_SET: ReadonlySet<string> = new Set(ALL_RELATIVE_ZONE_IDS);

export function isAbsoluteZone(ref: ZoneRef): ref is AbsoluteZoneId {
  return ABSOLUTE_ZONE_ID_SET.has(ref);
}

export function isRelativeZone(ref: ZoneRef): ref is RelativeZoneId {
  return RELATIVE_ZONE_ID_SET.has(ref);
}

/**
 * Résout une référence de zone (absolue ou relative au porteur) en `Point` du terrain.
 *
 * @param ref Référence de zone (ex: `'wing-left'` ou `'wing-strong'`).
 * @param ballSide Côté du porteur ('left' = porteur dans la moitié gauche du terrain).
 *                 Ignoré pour les zones absolues.
 * @returns Coordonnées du centre de la zone.
 */
export function resolveZone(ref: ZoneRef, ballSide: BallSide): Point {
  if (isAbsoluteZone(ref)) {
    return COURT_ZONES[ref].point;
  }
  if (isRelativeZone(ref)) {
    const absId = RELATIVE_TO_ABSOLUTE[ref][ballSide];
    return COURT_ZONES[absId].point;
  }
  // Branche défensive : ZoneRef est une union exhaustive, donc on ne devrait
  // jamais arriver ici. On lève pour signaler une référence inconnue.
  throw new Error(`Zone inconnue: ${ref}`);
}

/**
 * Résout une référence de zone en `AbsoluteZoneId` (utile pour les readers FR
 * et la persistence : on stocke la zone telle que choisie par le coach mais on
 * peut l'inspecter comme absolue à un point donné).
 */
export function resolveZoneId(ref: ZoneRef, ballSide: BallSide): AbsoluteZoneId {
  if (isAbsoluteZone(ref)) return ref;
  if (isRelativeZone(ref)) return RELATIVE_TO_ABSOLUTE[ref][ballSide];
  throw new Error(`Zone inconnue: ${ref}`);
}

/**
 * Détermine le côté du porteur à partir de sa position (helper pour le compileur).
 * Le centre du terrain est x = 300.
 */
export function ballSideFromCarrier(carrier: Point): BallSide {
  return carrier.x < 300 ? 'left' : 'right';
}
