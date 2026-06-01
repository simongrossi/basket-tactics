import type {
  AttackerId,
  AttackerPositions,
  AttackerProfiles,
  OffensiveProfile,
  Point,
} from '../../types';
import { COURT, FULL_COURT_INNER_MAX_Y } from '../../data/court';
import {
  buildSpacingGraph,
  totalSpacing,
  buildEJO,
  inCorridor,
  EJO_CORRIDOR_NARROW_PX,
} from '../tactical';

/**
 * Auto-positionnement des attaquants hors-ballon par optimisation gloutonne
 * de `totalSpacing` (graphe complet d'équipe), avec pénalité si la candidate
 * encombre le couloir EJO ballon→panier (sauf profils naturels du couloir :
 * `slasher`, `rim-roller`).
 *
 * Sortie : nouvelles positions cibles. Le caller doit les appliquer via
 * `moveAttackerInState` (push-out automatique → Règle 1 anti-superposition).
 */

/** Range de distances au panier (en pixels) selon le profil offensif —
 *  définit l'anneau dans lequel on échantillonne les positions candidates. */
const PROFILE_RING: Record<OffensiveProfile, [number, number]> = {
  creator: [150, 280],
  shooter: [240, 320],
  slasher: [80, 200],
  'rim-roller': [40, 120],
  'stretch-big': [220, 300],
  'non-shooter': [60, 160],
};
const DEFAULT_RING: [number, number] = [150, 250];

/** Pénalité (en px de spacing perdu) si la candidate tombe dans le couloir
 *  ballon→panier, sauf profils naturels du couloir. Suffisamment forte pour
 *  qu'une candidate hors-couloir avec spacing comparable soit préférée. */
export const CORRIDOR_PENALTY_PX = 60;

/** Bonus de score (px de spacing équivalent) quand un shooter/stretch-big
 *  se positionne dans un corner 3pts. Le corner est la position #1 du basket
 *  moderne : tir le plus court, défenseur forcé de sortir loin de la raquette. */
export const CORNER_BONUS_PX = 45;

/** Rayon de détection autour d'un coin (px). */
const CORNER_DETECT_RADIUS = 35;

/** Positions des deux corners 3pts pour demi-terrain haut (panier en y ≈ 75). */
const CORNER_POSITIONS_HALF: readonly [Point, Point] = [
  { x: 53, y: 80 },   // corner gauche
  { x: 547, y: 80 },  // corner droit
];

/** Profils qui bénéficient du bonus corner. */
const CORNER_BOOSTED_PROFILES: ReadonlySet<OffensiveProfile> = new Set<OffensiveProfile>([
  'shooter',
  'stretch-big',
]);

const CORRIDOR_FRIENDLY_PROFILES: ReadonlySet<OffensiveProfile> = new Set<OffensiveProfile>([
  'slasher',
  'rim-roller',
]);

export interface OptimizedPosition {
  id: AttackerId;
  pos: Point;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function courtMaxY(hoop: Point): number {
  // Half-court par défaut ; étendu si le panier est sur la moitié basse
  // (mode `fullCourt` avec attackingDirection='down').
  return hoop.y > COURT.innerMaxY ? FULL_COURT_INNER_MAX_Y : COURT.innerMaxY;
}

function clampToCourt(p: Point, hoop: Point): Point {
  return {
    x: clamp(p.x, COURT.marginX + 20, COURT.innerMaxX - 20),
    y: clamp(
      p.y,
      hoop.y < 540 ? COURT.marginY + 20 : 540 + 20,
      courtMaxY(hoop) - 20,
    ),
  };
}

/**
 * Génère un éventail de positions candidates dans un anneau autour du panier,
 * compatible avec le profil. Le demi-cercle est orienté vers l'intérieur du
 * terrain (= côté opposé à la baseline du panier).
 */
function generateCandidates(
  hoop: Point,
  profile: OffensiveProfile | undefined,
): Point[] {
  const [minR, maxR] = PROFILE_RING[profile ?? 'creator'] ?? DEFAULT_RING;
  const radii = [minR, (minR + maxR) / 2, maxR];
  // Direction "vers l'intérieur du terrain" depuis le panier.
  const intoCourt: Point = hoop.y < 540 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  // 5 angles répartis sur 180° autour de la direction intoCourt
  // (= demi-cercle face au panier).
  const fanDegrees = [-72, -36, 0, 36, 72];
  const out: Point[] = [];
  for (const r of radii) {
    for (const deg of fanDegrees) {
      const rad = (deg * Math.PI) / 180;
      const dx = intoCourt.x * Math.cos(rad) - intoCourt.y * Math.sin(rad);
      const dy = intoCourt.x * Math.sin(rad) + intoCourt.y * Math.cos(rad);
      out.push(
        clampToCourt(
          { x: hoop.x + r * dx, y: hoop.y + r * dy },
          hoop,
        ),
      );
    }
  }
  // Pour shooter/stretch-big : injecter les 2 corners comme candidates
  // explicites (en plus de l'éventail générique).
  if (CORNER_BOOSTED_PROFILES.has(profile ?? 'creator')) {
    const corners = hoop.y < 540
      ? CORNER_POSITIONS_HALF
      : (CORNER_POSITIONS_HALF.map(c => ({ x: c.x, y: 1080 - c.y })) as [Point, Point]);
    corners.forEach(c => out.push(clampToCourt(c, hoop)));
  }
  return out;
}

/**
 * Pour chaque attaquant non-porteur, choisit la candidate qui maximise
 * `totalSpacing − corridorPenalty`. Passe unique gloutonne dans l'ordre des
 * ids.
 */
export function computeOffBallPositions(
  off: AttackerPositions,
  carrier: AttackerId,
  hoop: Point,
  profiles?: AttackerProfiles,
): OptimizedPosition[] {
  const carrierPos = off[carrier];
  const ejo = buildEJO(carrierPos, hoop, EJO_CORRIDOR_NARROW_PX);

  // Copie de travail mutée au fur et à mesure des placements.
  const current: AttackerPositions = { ...off };

  const result: OptimizedPosition[] = [];
  const nonCarriers = (Object.keys(off) as AttackerId[]).filter(
    (id) => id !== carrier,
  );

  for (const id of nonCarriers) {
    const profile = profiles?.[id];
    const candidates = generateCandidates(hoop, profile);

    let bestScore = -Infinity;
    let bestPos = current[id];

    for (const cand of candidates) {
      const trial = { ...current, [id]: cand };
      const g = buildSpacingGraph(trial);
      let score = totalSpacing(g);

      if (
        !CORRIDOR_FRIENDLY_PROFILES.has(profile ?? 'creator') &&
        inCorridor(cand, ejo)
      ) {
        score -= CORRIDOR_PENALTY_PX;
      }

      // Bonus corner pour shooter/stretch-big : incite l'occupation des coins.
      if (CORNER_BOOSTED_PROFILES.has(profile ?? 'creator')) {
        const corners = hoop.y < 540
          ? CORNER_POSITIONS_HALF
          : (CORNER_POSITIONS_HALF.map(c => ({ x: c.x, y: 1080 - c.y })) as [Point, Point]);
        if (corners.some(corner => Math.hypot(cand.x - corner.x, cand.y - corner.y) < CORNER_DETECT_RADIUS)) {
          score += CORNER_BONUS_PX;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPos = cand;
      }
    }

    current[id] = bestPos;
    result.push({ id, pos: bestPos });
  }

  return result;
}
