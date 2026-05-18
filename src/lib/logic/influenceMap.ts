// CVT Chantier 2 — Influence Map & trajectoires invisibles.
//
// Statut : **infrastructure pure, non câblée**. Module math pur
// déterministe posant les primitives géométriques pour le contrôle
// défensif des lignes de passe et couloirs de pénétration.
//
// Le câblage dans le pipeline défensif (probablement nouvelle couche
// `influenceLayer` entre `baseTargets` et `pnrRotations`) est une
// sous-étape 2b séparée. À ce stade le module est utilisable mais
// inutilisé — zéro impact runtime.
//
// API exposée :
// - `buildPassingLanes` : segments porteur ↔ non-porteurs.
// - `buildDrivingLane` : segment porteur ↔ panier.
// - `signedPerpDistance` : distance perpendiculaire **signée** d'un
//   point à un segment orienté (positif à gauche, négatif à droite
//   du vecteur a→b).
// - `projectOnSegment` : projection orthogonale d'un point sur un
//   segment, clampée aux extrémités.
// - `interposeForce` : force `seek` vers la projection (= force
//   d'alignement à la ligne de passe / pénétration).
// - `interposeForcesAgainstLanes` : batch sur plusieurs lignes.

import type {
  AttackerId,
  AttackerPositions,
  Point,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { seek, type SteeringForce } from './steeringEngine';

/**
 * Segment de ligne tactique (porteur ↔ cible). Représente une "ligne
 * invisible" à contrôler par les défenseurs (deny passe, fermer drive).
 */
export interface InfluenceLane {
  /** Identifiant lisible pour debug : `'pass-O3'`, `'drive-hoop'`. */
  kind: 'pass' | 'drive';
  /** Identifiant de la cible (attacker id pour pass, `'hoop'` pour drive). */
  toId: AttackerId | 'hoop';
  /** Origine du segment (= porteur). */
  a: Point;
  /** Cible du segment (= attacker.pos pour pass, hoop pour drive). */
  b: Point;
}

/**
 * Génère tous les segments de passe `porteur → non-porteur`.
 *
 * `carrierId` est exclu (pas de "ligne de passe vers soi-même"). Les
 * attaquants absents (`undefined`) sont aussi filtrés.
 */
export function buildPassingLanes(
  carrierId: AttackerId,
  carrierPos: Point,
  off: AttackerPositions,
): InfluenceLane[] {
  const lanes: InfluenceLane[] = [];
  for (const [id, pos] of Object.entries(off) as [AttackerId, Point | undefined][]) {
    if (id === carrierId) continue;
    if (!pos) continue;
    lanes.push({ kind: 'pass', toId: id, a: carrierPos, b: pos });
  }
  return lanes;
}

/**
 * Segment du couloir de pénétration `porteur → panier`. Toujours un
 * seul segment (le panier est la cible canonique du drive). Le
 * paramètre `hoop` permet d'inverser le sens d'attaque pour
 * `HOOP_OPPOSITE`.
 */
export function buildDrivingLane(carrierPos: Point, hoop: Point = HOOP): InfluenceLane {
  return { kind: 'drive', toId: 'hoop', a: carrierPos, b: hoop };
}

/**
 * Distance perpendiculaire **signée** d'un point au segment `[a,b]`.
 *
 * - Convention : positif à gauche du vecteur `a→b`, négatif à droite
 *   (système de coordonnées écran y-vers-le-bas → "à gauche" =
 *   produit vectoriel z positif).
 * - Si le segment est dégénéré (`|a-b| < ε`) : retourne 0 par
 *   convention (le point n'a pas de côté défini sans direction).
 * - Ne projette PAS hors du segment — c'est une distance perpendiculaire
 *   à la droite passant par `a` et `b`, **pas** au segment fini.
 *   Pour la distance au segment fini, voir `pointToSegmentDistance`
 *   dans `geometry.ts`.
 */
export function signedPerpDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  // Produit vectoriel 2D : (b-a) × (p-a) = dx*(py-ay) - dy*(px-ax)
  // Divisé par |b-a| = projection sur le perpendiculaire normalisé
  return (dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}

/**
 * Projection orthogonale de `p` sur le segment `[a,b]`. Clampée aux
 * extrémités : si la projection tombe hors `[a,b]`, retourne `a` ou
 * `b` selon le plus proche.
 */
export function projectOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * Force `interpose` : pousse le défenseur vers la projection
 * orthogonale sur la ligne tactique. Variante de `seek` avec une
 * cible **calculée dynamiquement** depuis la géométrie du segment.
 *
 * Effet basket : aide / deny / shadow — le défenseur cherche à
 * occuper la ligne de passe ou le couloir de pénétration. Combiné
 * avec `seek` vers l'homme (composition additive Reynolds), produit
 * un comportement "split entre l'homme et la ligne" naturel.
 *
 * Force morte si `defenderRef` est déjà sur la projection (rien à
 * corriger).
 */
export function interposeForce(
  defenderRef: Point,
  laneA: Point,
  laneB: Point,
  weight: number,
  label: string,
): SteeringForce {
  const proj = projectOnSegment(defenderRef, laneA, laneB);
  if (weight <= 0) return { direction: { x: 0, y: 0 }, weight: 0, label };
  if (distance(defenderRef, proj) < 1e-6) {
    return { direction: { x: 0, y: 0 }, weight: 0, label };
  }
  return seek(defenderRef, proj, weight, label);
}

/**
 * Batch : émet une `interposeForce` par lane. Les labels incluent
 * `kind` et `toId` pour le debug.
 */
export function interposeForcesAgainstLanes(
  defenderRef: Point,
  lanes: ReadonlyArray<InfluenceLane>,
  weight: number,
): SteeringForce[] {
  return lanes.map((lane) =>
    interposeForce(defenderRef, lane.a, lane.b, weight, `interpose-${lane.kind}-${lane.toId}`),
  );
}
