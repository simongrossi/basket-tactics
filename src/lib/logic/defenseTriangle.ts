// CVT Chantier 3 — Triangle défensif vectoriel dynamique.
//
// Statut : **infrastructure pure, non câblée**. Module math pur
// déterministe formalisant le positionnement off-ball à partir du
// repère **Ballon – Défenseur – Attaquant – Panier**.
//
// API exposée :
// - `triangleAngleDeg` : angle θ au sommet défenseur, formé par les
//   vecteurs (def→ballon) et (def→attaquant). Servant à évaluer la
//   posture *open stance* / *head-on-swivel*.
// - `profileWeightMultipliers` : multiplicateurs `manWeight` /
//   `basketWeight` selon le profil offensif du marqué — pondération
//   du Chantier 3 (shooter → deny dominant, slasher → sag dominant).
// - `isPassShadowed` : vrai si le défenseur occulte parfaitement
//   la ligne de passe porteur↔attaquant (distance perpendiculaire
//   signée < `PASS_SHADOW_TOLERANCE_PX` ET projection dans le
//   segment).
// - `passShadowsByDefender` : batch — produit un map { defenderId →
//   bool } pour propagation dans `ComputedDefender.isPassShadowed`.

import type { Point, OffensiveProfile, DefenderId, AttackerId, AttackerPositions } from '../types';
import { PASS_SHADOW_TOLERANCE_PX } from '../data/physics';
import { projectOnSegment, signedPerpDistance } from './influenceMap';

/**
 * Angle θ (degrés, 0..180) au sommet `defenderPos`, formé par les
 * vecteurs vers le ballon et vers l'attaquant marqué.
 *
 * - 0° : défenseur entre ballon et attaquant, exactement aligné.
 * - 90° : posture *open stance* — défenseur peut voir les deux
 *   à 90° (vision triangulaire idéale).
 * - 180° : défenseur "entre" géométriquement mais alignement
 *   opposé — généralement signe d'un mauvais placement.
 *
 * Si défenseur === ballon ou défenseur === attaquant, retourne 0.
 */
export function triangleAngleDeg(
  ballPos: Point,
  defenderPos: Point,
  attackerPos: Point,
): number {
  const v1x = ballPos.x - defenderPos.x;
  const v1y = ballPos.y - defenderPos.y;
  const v2x = attackerPos.x - defenderPos.x;
  const v2y = attackerPos.y - defenderPos.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return 0;
  const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
  // Clamp anti-NaN (les arrondis float peuvent pousser cos hors [-1, 1])
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * Multiplicateurs de poids appliqués aux forces principales selon
 * le profil offensif de l'attaquant marqué.
 *
 * - `manWeight` : multiplie le poids des forces tournées vers l'homme
 *   (seek-man, arrive-man, deny strong-side).
 * - `basketWeight` : multiplie le poids des forces tournées vers la
 *   raquette (sag weak-side, help paint, recul protection).
 *
 * Calibration basket :
 * - `shooter` / `stretch-big` : prioriser le deny (interdiction de
 *   lâcher la ligne de passe). `manWeight > 1`, `basketWeight < 1`.
 * - `slasher` / `rim-roller` : prioriser la protection raquette
 *   (anticiper le drive). `basketWeight > 1`, `manWeight ≤ 1`.
 * - `creator` : neutre — peut driver ou shooter, équilibrer.
 * - `non-shooter` : laisser flotter — `basketWeight > 1` pour
 *   maximiser l'aide.
 */
export interface ProfileWeightMultipliers {
  manWeight: number;
  basketWeight: number;
}

export function profileWeightMultipliers(profile?: OffensiveProfile): ProfileWeightMultipliers {
  switch (profile) {
    case 'shooter':     return { manWeight: 1.4,  basketWeight: 0.7  };
    case 'stretch-big': return { manWeight: 1.3,  basketWeight: 0.85 };
    case 'creator':     return { manWeight: 1.1,  basketWeight: 1.0  };
    case 'slasher':     return { manWeight: 0.85, basketWeight: 1.4  };
    case 'rim-roller':  return { manWeight: 0.9,  basketWeight: 1.3  };
    case 'non-shooter': return { manWeight: 0.7,  basketWeight: 1.2  };
    default:            return { manWeight: 1.0,  basketWeight: 1.0  };
  }
}

/**
 * Vrai si `defenderPos` occulte la ligne de passe `carrier ↔ attacker` :
 * - distance perpendiculaire à la droite < tolérance (en valeur absolue),
 * - ET projection orthogonale dans le segment (entre carrier et attacker).
 *
 * Faux si le segment est dégénéré (`|carrier - attacker| < ε`).
 */
export function isPassShadowed(
  defenderPos: Point,
  carrierPos: Point,
  attackerPos: Point,
  tolerance: number = PASS_SHADOW_TOLERANCE_PX,
): boolean {
  const dx = attackerPos.x - carrierPos.x;
  const dy = attackerPos.y - carrierPos.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return false;
  // Projection paramétrique t ∈ [0, 1] = dans le segment.
  const t = ((defenderPos.x - carrierPos.x) * dx + (defenderPos.y - carrierPos.y) * dy) / lenSq;
  if (t < 0 || t > 1) return false;
  const perp = signedPerpDistance(defenderPos, carrierPos, attackerPos);
  return Math.abs(perp) < tolerance;
}

/**
 * Pour chaque défenseur, indique si SA position occulte UNE
 * quelconque ligne de passe vers un attaquant non-porteur.
 *
 * Sortie : map `{ DefenderId → boolean }`. Vrai si le défenseur
 * shadow au moins une ligne. Destiné à alimenter
 * `ComputedDefender.isPassShadowed` pour autoriser les défenseurs
 * adjacents à flotter en aide.
 */
export function passShadowsByDefender(
  defenders: Record<DefenderId, Point>,
  carrierId: AttackerId,
  carrierPos: Point,
  off: AttackerPositions,
  tolerance: number = PASS_SHADOW_TOLERANCE_PX,
): Record<DefenderId, boolean> {
  const out: Record<string, boolean> = {};
  const targets = Object.entries(off) as [AttackerId, Point | undefined][];
  for (const [dId, dPos] of Object.entries(defenders) as [DefenderId, Point][]) {
    let shadowing = false;
    for (const [oId, oPos] of targets) {
      if (oId === carrierId) continue;
      if (!oPos) continue;
      if (isPassShadowed(dPos, carrierPos, oPos, tolerance)) {
        shadowing = true;
        break;
      }
    }
    out[dId] = shadowing;
  }
  return out as Record<DefenderId, boolean>;
}
