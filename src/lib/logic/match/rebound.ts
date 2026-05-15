// Phase E.1 V1 — modèle de rebond.
//
// Sur tir manqué, détermine qui récupère la balle. Modèle simple basé sur :
//  - position de chaque joueur relative au panier
//  - profil (rim-roller / stretch-big avantage, creator / shooter pénalité)
//  - zone du tir (au cercle = bigs dominent paint, longue distance = plus aléatoire)
//
// Retourne un `ReboundResult` lisible : qui récupère (PlayerId), de quel
// type (offensif / défensif / sortie de balle), et la position du rebond.
// La game loop branche dessus pour décider de la transition.

import type {
  AttackerId,
  AttackerPositions,
  AttackerProfiles,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import { distance } from '@/lib/logic/geometry';

// ============================================================
// Types
// ============================================================

export type ReboundType = 'offensive' | 'defensive' | 'team-out';
export type ReboundParticipant = AttackerId | DefenderId;

export interface ReboundResult {
  /** Joueur qui récupère la balle. `null` uniquement si type 'team-out'
   *  (cas dégénéré sans joueur éligible). */
  rebounder: ReboundParticipant | null;
  /** Type du rebond. Détermine la transition de possession. */
  type: ReboundType;
  /** Distribution des poids relatifs (pour debug / explication HUD). */
  weights: Partial<Record<ReboundParticipant, number>>;
  /** Position approximative du rebond (= position du rebondeur ou
   *  position sous le cercle si team-out). */
  position: Point;
}

export interface ComputeReboundParams {
  off: AttackerPositions;
  defPos: ComputedDefense;
  hoop: Point;
  /** Position où le tir a été pris. Affecte les poids (les rebonds
   *  longs ont une distribution plus uniforme). */
  shotPos: Point;
  /** Profils offensifs pour moduler le poids par joueur (rim-roller
   *  avantage, shooter pénalité). */
  attackerProfiles?: AttackerProfiles;
  /** Carrier au moment du tir (= shooter). Sera pénalisé pour le
   *  rebond offensif (il faut "se relancer" après son tir). */
  shooter: AttackerId | null;
  rng: () => number;
}

// ============================================================
// Constantes
// ============================================================

/** Distance max (px) au panier pour être éligible au rebond. Au-delà,
 *  poids = 0 (impossible physiquement de contester). ~9.5 m. */
const REBOUND_ELIGIBILITY_PX = 350;

/** Distance "idéale" pour rebondir : sous l'anneau. Le poids décroît
 *  linéairement de 1.0 à 0 entre 0 et REBOUND_ELIGIBILITY_PX. */
const REBOUND_DISTANCE_FALLOFF_PX = 250;

/** Pénalité de poids appliquée au shooter (il vient de tirer, il est
 *  rarement bien placé pour rebondir son propre tir). */
const SHOOTER_REBOUND_PENALTY = 0.4;

/** Modificateurs par profil offensif. > 1 = avantage rebondeur. */
const PROFILE_REBOUND_MULTIPLIER: Record<string, number> = {
  'rim-roller': 1.4,
  'stretch-big': 1.2,
  creator: 0.85,
  shooter: 0.85,
  slasher: 1.0,
  'non-shooter': 1.0,
};

/** Bonus défense : les défenseurs ont statistiquement un meilleur
 *  positionnement de rebond (NBA ~73 % défensifs en moyenne). */
const DEFENSIVE_BONUS = 1.6;

/** Si le tir vient de longue distance (> deep zone ≈ 320 px du panier),
 *  les rebonds sont plus aléatoires (la balle ricoche loin). Multiplie
 *  les poids par un facteur réducteur pour augmenter la variance. */
const LONG_SHOT_RANDOM_BLEND = 0.5;

// ============================================================
// API
// ============================================================

/**
 * Calcule le rebondeur sur tir manqué. RNG seedée pour reproductibilité.
 *
 * Algorithme :
 *  1. Pour chaque joueur (attaquant + défenseur), calcule un poids :
 *     - 0 si distance > REBOUND_ELIGIBILITY_PX
 *     - sinon : (1 - dist / falloff) × profile × side × shooter_penalty
 *  2. Mélange avec un poids "random" si tir longue distance
 *  3. Tire aléatoire pondéré
 *  4. Retourne le joueur + type (offensif si attaquant, défensif sinon)
 *
 * Cas dégénéré : si tous les poids sont 0 (aucun joueur dans le rayon
 *  d'éligibilité, très rare) → retourne `type: 'team-out'` avec
 *  `rebounder: null`.
 */
export function computeRebound(params: ComputeReboundParams): ReboundResult {
  const { off, defPos, hoop, shotPos, attackerProfiles, shooter, rng } = params;
  const weights: Partial<Record<ReboundParticipant, number>> = {};

  const distFromHoopShot = distance(shotPos, hoop);
  const longShotBlend =
    distFromHoopShot > 320 ? LONG_SHOT_RANDOM_BLEND : 1.0;

  // Attaquants
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const pos = off[id];
    if (!pos) return;
    const d = distance(pos, hoop);
    if (d > REBOUND_ELIGIBILITY_PX) return;
    const distFactor = Math.max(0, 1 - d / REBOUND_DISTANCE_FALLOFF_PX);
    const profile = attackerProfiles?.[id] ?? 'creator';
    const profileMul = PROFILE_REBOUND_MULTIPLIER[profile] ?? 1.0;
    const shooterMul = id === shooter ? SHOOTER_REBOUND_PENALTY : 1.0;
    weights[id] = distFactor * profileMul * shooterMul * longShotBlend;
  });

  // Défenseurs
  (Object.keys(defPos) as DefenderId[]).forEach((id) => {
    const p = defPos[id];
    if (!p) return;
    const pos = { x: p.x, y: p.y };
    const d = distance(pos, hoop);
    if (d > REBOUND_ELIGIBILITY_PX) return;
    const distFactor = Math.max(0, 1 - d / REBOUND_DISTANCE_FALLOFF_PX);
    weights[id] = distFactor * DEFENSIVE_BONUS * longShotBlend;
  });

  // Sum des poids.
  const totalWeight = Object.values(weights).reduce(
    (sum, w) => sum + (w ?? 0),
    0
  );
  if (totalWeight <= 0) {
    return {
      rebounder: null,
      type: 'team-out',
      weights,
      position: { ...hoop },
    };
  }

  // Tirage pondéré.
  let roll = rng() * totalWeight;
  let picked: ReboundParticipant | null = null;
  for (const [id, w] of Object.entries(weights)) {
    if (!w) continue;
    roll -= w;
    if (roll <= 0) {
      picked = id as ReboundParticipant;
      break;
    }
  }
  if (!picked) {
    // Cas de bordure (somme arrondie) — prend le dernier non-nul.
    picked = (Object.entries(weights).find(([, w]) => (w ?? 0) > 0)?.[0] ?? null) as
      | ReboundParticipant
      | null;
  }
  if (!picked) {
    return {
      rebounder: null,
      type: 'team-out',
      weights,
      position: { ...hoop },
    };
  }

  const type: ReboundType = picked.startsWith('O') ? 'offensive' : 'defensive';
  const rebounderPos =
    type === 'offensive' ? off[picked as AttackerId] : defPos[picked as DefenderId];
  const position = rebounderPos
    ? { x: rebounderPos.x, y: rebounderPos.y }
    : { ...hoop };

  return { rebounder: picked, type, weights, position };
}
