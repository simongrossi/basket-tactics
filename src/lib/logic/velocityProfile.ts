// Phy.O — Profil de vitesse offensif piloté par courbure.
//
// Pour chaque path (polyline lissée Catmull-Rom), calcule un mapping
// `actionT_linéaire ∈ [0,1] → s/L ∈ [0,1]` (fraction d'arc à laquelle
// sampler le path). Les endpoints sont strictement préservés : un
// attaquant arrive toujours à `ann.to` au boundary du segment.
//
// Modèle : v(s) = 1 / (1 + α × κ(s)). Lent dans les virages (κ élevé),
// rapide en ligne droite (κ=0 → v=1). α modulé par le tier athlétique
// (elite ×0.7, lent ×1.4 — l'elite garde plus de vitesse en virage).
//
// Pur, déterministe, sans mutation d'entrée.

import type { AttackerSpeedTier, Point } from '../types';
import {
  OFFENSIVE_CURVATURE_SENSITIVITY,
  OFFENSIVE_PROFILE_SAMPLES,
  OFFENSIVE_TIER_MULTIPLIER,
} from '../data/physics';
import { samplePolyline } from './polyline';

// Re-export pour usage local (caller dans playbackTrajectory.ts importe
// depuis ce module pour éviter de connaître la structure de `types`).
export type { AttackerSpeedTier };

export interface VelocityProfileOptions {
  /** α de base : sensibilité à la courbure. Défaut : OFFENSIVE_CURVATURE_SENSITIVITY. */
  curvatureSensitivity?: number;
  /** Tier athlétique → multiplie α. Absent = standard (×1.0). */
  tier?: AttackerSpeedTier;
  /** Nombre de points d'échantillonnage. Défaut : OFFENSIVE_PROFILE_SAMPLES. */
  samples?: number;
}

export interface VelocityProfile {
  /** Remap actionT_linéaire ∈ [0,1] → fraction d'arc s/L ∈ [0,1]. */
  remap: (actionT: number) => number;
  /** Longueur totale du path (somme des segments). */
  length: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Courbure discrète à chaque point (endpoints = 0).
 *  Formule κ ≈ 2 × |d1 × d2| / (|d1| × |d2| × |d1+d2|). */
function computeCurvatures(samples: Point[]): number[] {
  const n = samples.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const p0 = samples[i - 1];
    const p1 = samples[i];
    const p2 = samples[i + 1];
    const d1x = p1.x - p0.x;
    const d1y = p1.y - p0.y;
    const d2x = p2.x - p1.x;
    const d2y = p2.y - p1.y;
    const cross = Math.abs(d1x * d2y - d1y * d2x);
    const n1 = Math.hypot(d1x, d1y);
    const n2 = Math.hypot(d2x, d2y);
    const nSum = Math.hypot(d1x + d2x, d1y + d2y);
    const denom = n1 * n2 * nSum;
    out[i] = denom > 1e-9 ? (2 * cross) / denom : 0;
  }
  return out;
}

/** Remap identité, utilisée pour les cas dégénérés (path trivial,
 *  length 0). Renvoie t clampé à [0, 1]. */
function identityRemap(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function buildVelocityProfile(
  path: Point[],
  options: VelocityProfileOptions = {},
): VelocityProfile {
  const samples = Math.max(8, options.samples ?? OFFENSIVE_PROFILE_SAMPLES);
  const alphaBase = options.curvatureSensitivity ?? OFFENSIVE_CURVATURE_SENSITIVITY;
  const tierFactor = options.tier ? OFFENSIVE_TIER_MULTIPLIER[options.tier] : 1.0;
  const alpha = alphaBase * tierFactor;

  if (path.length < 2) {
    return { remap: identityRemap, length: 0 };
  }

  // Échantillonne sur la courbe Catmull-Rom LISSÉE (et non sur la polyligne
  // raw), pour que la courbure capturée corresponde à ce que le joueur
  // suit réellement à l'écran. samplePolyline applique la reparam en
  // longueur d'arc des segments + interpolation Catmull-Rom (τ=0.5).
  const pts: Point[] = [];
  for (let k = 0; k <= samples; k++) {
    pts.push(samplePolyline(path, k / samples));
  }
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += distance(pts[i], pts[i + 1]);
  if (total < 1e-6) {
    return { remap: identityRemap, length: 0 };
  }

  const curvs = computeCurvatures(pts);
  // Vitesse à chaque point : v = 1 / (1 + α κ). v ∈ (0, 1].
  const vs = curvs.map((k) => 1 / (1 + alpha * k));

  // Temps cumulé : t_phys(i) = Σ Δs / avg(v_{j-1}, v_j).
  const dsUniform = total / samples;
  const tPhys = new Array<number>(pts.length).fill(0);
  for (let i = 1; i < pts.length; i++) {
    const vAvg = (vs[i - 1] + vs[i]) * 0.5;
    tPhys[i] = tPhys[i - 1] + dsUniform / vAvg;
  }
  const tPhysMax = tPhys[tPhys.length - 1];
  if (tPhysMax < 1e-9) {
    return { remap: identityRemap, length: total };
  }

  // Normaliser → [0, 1] strictement croissant.
  const tNorm = tPhys.map((t) => t / tPhysMax);

  // Remap : recherche binaire dans tNorm, interpolation linéaire entre
  // les deux points encadrants. s/L = (lo + frac) / samples.
  const remap = (actionT: number): number => {
    const t = Math.max(0, Math.min(1, actionT));
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = tNorm.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tNorm[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = tNorm[hi] - tNorm[lo];
    const frac = span > 1e-9 ? (t - tNorm[lo]) / span : 0;
    return (lo + frac) / samples;
  };

  return { remap, length: total };
}
