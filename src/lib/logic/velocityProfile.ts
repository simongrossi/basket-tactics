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
  OFFENSIVE_FRICTION_FLOOR,
  OFFENSIVE_FRICTION_THRESHOLD_PX,
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
  /** Phy.O V2 — Positions des autres joueurs (snapshot mid-segment).
   *  Si fourni et non vide, applique un facteur friction par sample. */
  obstacles?: Point[];
  /** Phy.O V2 — Distance en deçà de laquelle un obstacle ralentit.
   *  Défaut : `OFFENSIVE_FRICTION_THRESHOLD_PX` (30 px). */
  frictionThreshold?: number;
  /** Phy.O V2 — Facteur minimum (au contact). Défaut :
   *  `OFFENSIVE_FRICTION_FLOOR` (0.6). */
  frictionFloor?: number;
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

/** Friction par sample : 1 si tous les obstacles sont à >= threshold ;
 *  sinon interpole entre `floor` (au contact) et 1 (au threshold).
 *  Mirror per-point de `proximityFriction` (Lever B défensif). */
function computeFrictions(
  samples: Point[],
  obstacles: Point[],
  threshold: number,
  floor: number,
): number[] {
  const out = new Array<number>(samples.length).fill(1);
  if (obstacles.length === 0) return out;
  for (let i = 0; i < samples.length; i++) {
    let minDist = Infinity;
    for (const o of obstacles) {
      const d = Math.hypot(o.x - samples[i].x, o.y - samples[i].y);
      if (d < minDist) minDist = d;
    }
    if (minDist >= threshold) {
      out[i] = 1;
    } else {
      const tFr = Math.max(0, minDist) / threshold;
      out[i] = floor + (1 - floor) * tFr;
    }
  }
  return out;
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
  // Phy.O V2 — friction de proximité : factor ∈ [floor, 1] par sample.
  const frictionThreshold = options.frictionThreshold ?? OFFENSIVE_FRICTION_THRESHOLD_PX;
  const frictionFloor = options.frictionFloor ?? OFFENSIVE_FRICTION_FLOOR;
  const frictions = computeFrictions(
    pts,
    options.obstacles ?? [],
    frictionThreshold,
    frictionFloor,
  );
  // v(s) = friction(s) / (1 + α κ(s)). Friction <= 1, donc v plus petit
  // aux points proches d'un obstacle → temps physique avance plus vite
  // → après inversion, le joueur a moins parcouru à un actionT donné.
  const vs = curvs.map((k, i) => frictions[i] / (1 + alpha * k));

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
