// #8.1 — Easing de relâche du blitz (ease-out cubique).
//
// Symétrique de closeoutEasing (qui est sprint→freinage / ease-in dominant).
// Ici les 2 trappeurs DÉCROCHENT vite de la cage puis se posent sur leur
// cible : départ rapide, ralentissement à l'arrivée.
//
// Appliqué dans frameResolver quand defB[id].blitzRecovering ET !screenMode,
// au même point que closeoutEasing.

/**
 * t ∈ [0,1] → progression spatiale ∈ [0,1], ease-out cubique `1-(1-t)^3`.
 * e(0)=0, e(1)=1, monotone, e(0.5)=0.875 (>0.5 → départ rapide).
 */
export function blitzReleaseEasing(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = 1 - t;
  return 1 - u * u * u;
}
