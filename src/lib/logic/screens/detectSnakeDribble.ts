// Détection du SNAKE DRIBBLE (B4).
//
// Snake = le porteur engage l'écran (step N-2), recule pour rompre la
// couverture (step N-1, retraite), puis re-attaque le même écran (step N).
// Lecture offensive utilisée quand le premier passage n'a pas créé d'avantage :
// le porteur "remet une couche" pour forcer la défense à recovers DEUX fois.
//
// Différent du reject (B2) qui REFUSE l'écran sans contact. Le snake UTILISE
// l'écran à N-2 et à N (avec une pause de retraite entre).
//
// Pattern temporel en V :
//
//   distance carrier ↔ screener :
//
//     d(N-2) faible (~30px, engagé)
//     d(N-1) élevée (>50px, retraite — sommet du V)
//     d(N)   faible (~30px, ré-engagé)
//
// Critères stricts :
//   1. Le porteur a bougé ≥ 25 px sur CHAQUE segment (N-2→N-1 ET N-1→N).
//      Note : pas de critère sur le mouvement total N-2 → N — un snake
//      parfait revient PILE à sa position d'engagement, donc total ≈ 0.
//   2. À N-2 ET à N, le porteur est dans `screenRadius * 2` du poseur
//      (engagement réel des deux côtés du V)
//   3. La distance a MONTÉ d'au moins 25 px de N-2 à N-1 (retraite réelle)
//   4. La distance a CHUTÉ d'au moins 25 px de N-1 à N (ré-engagement réel)
//
// V1 : diagnostic-only. Le moteur défensif ne réagit pas (à terme : maintenir
// la couverture engagée pendant la retraite plutôt que de relâcher).

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  Matchups,
} from '../../types';
import { distance } from '../geometry';

export interface SnakeDribble {
  /** Le poseur du snake (même à N-2 et à N). */
  screener: AttackerId;
  screenerDef: DefenderId;
  carrier: AttackerId;
  carrierDef: DefenderId;
  /** Distance porteur ↔ poseur à N-2 (engagé, faible). */
  distAtEntry: number;
  /** Distance porteur ↔ poseur à N-1 (sommet du V, retraite). */
  distAtPeak: number;
  /** Distance porteur ↔ poseur à N (ré-engagé, faible). */
  distAtReturn: number;
}

const MIN_CARRIER_SEGMENT_MOVEMENT_PX = 25;
const MIN_V_DELTA_PX = 25;
const ENGAGEMENT_RADIUS_MULTIPLIER = 2; // screenRadius × 2 = "engagé"

export function detectSnakeDribble(
  off: AttackerPositions,
  prevOff: AttackerPositions | null,
  prevPrevOff: AttackerPositions | null,
  ballCarrier: AttackerId,
  matchups: Matchups,
  screenRadius: number
): SnakeDribble | null {
  if (!prevOff || !prevPrevOff) return null;

  const c2 = prevPrevOff[ballCarrier]; // step N-2
  const c1 = prevOff[ballCarrier];     // step N-1
  const c0 = off[ballCarrier];         // step N
  if (!c2 || !c1 || !c0) return null;

  // Mouvement du porteur sur CHAQUE segment. Un snake parfait revient au
  // point d'engagement (total ≈ 0) ; on valide donc la retraite (N-2 → N-1)
  // et le retour (N-1 → N) séparément.
  if (distance(c2, c1) < MIN_CARRIER_SEGMENT_MOVEMENT_PX) return null;
  if (distance(c1, c0) < MIN_CARRIER_SEGMENT_MOVEMENT_PX) return null;

  const engagementRadius = screenRadius * ENGAGEMENT_RADIUS_MULTIPLIER;

  let bestScreener: AttackerId | null = null;
  let bestVscore = -Infinity;

  for (const oId of Object.keys(prevPrevOff) as AttackerId[]) {
    if (oId === ballCarrier) continue;
    const s2 = prevPrevOff[oId];
    const s1 = prevOff[oId];
    const s0 = off[oId];
    if (!s2 || !s1 || !s0) continue;

    const d2 = distance(c2, s2);
    const d1 = distance(c1, s1);
    const d0 = distance(c0, s0);

    // Engagement réel à N-2 ET à N.
    if (d2 > engagementRadius) continue;
    if (d0 > engagementRadius) continue;

    // V strict : montée puis descente significatives.
    const upDelta = d1 - d2;
    const downDelta = d1 - d0;
    if (upDelta < MIN_V_DELTA_PX) continue;
    if (downDelta < MIN_V_DELTA_PX) continue;

    // Score combiné — préfère le V le plus marqué.
    const vScore = upDelta + downDelta;
    if (vScore > bestVscore) {
      bestVscore = vScore;
      bestScreener = oId;
    }
  }

  if (!bestScreener) return null;

  // Identifier les défenseurs (matchups est celui du step courant).
  let carrierDef: DefenderId | null = null;
  let screenerDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, a]) => {
    if (a === ballCarrier) carrierDef = d;
    if (a === bestScreener) screenerDef = d;
  });
  if (!carrierDef || !screenerDef) return null;

  return {
    screener: bestScreener,
    screenerDef,
    carrier: ballCarrier,
    carrierDef,
    distAtEntry: distance(c2, prevPrevOff[bestScreener]!),
    distAtPeak: distance(c1, prevOff[bestScreener]!),
    distAtReturn: distance(c0, off[bestScreener]!),
  };
}
