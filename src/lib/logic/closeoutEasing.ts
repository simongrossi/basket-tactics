// C.1 — Closeout footwork (sprint + freinage).
//
// Aujourd'hui, l'interpolation entre 2 steps est linéaire pour la plupart
// des défenseurs. Le `closeoutBoost` augmente la vitesse max (gère le "il
// arrive plus vite") mais ne change PAS la courbe de l'arrivée : le défenseur
// arrive en glissant.
//
// Basket réel :
//  - Phase **sprint** sur ~65 % de la transition : accélération franche,
//    bras bas, focus distance à fermer
//  - Phase **freinage** sur ~35 % finaux : décélération, bras hauts,
//    arrivée "in control" pour pouvoir contester / changer de direction
//
// Visuellement : la position interpolée doit avancer vite au début puis
// ralentir à l'arrivée. Mathématiquement : un easing sprint→freinage
// (combinaison easeOut puis easeIn).
//
// Cet helper est appliqué dans `frameResolver` quand un défenseur a
// `closingOut: true` ET n'est pas en `screenMode` (le screen easing prime).
//
// V1 : courbe fixe (65/35). V2 possible : paramétrer le ratio sprint/freinage
// par profil défenseur (élite = freine plus tard, agressif).

/** Ratio sprint/freinage. À 0.65, le défenseur fait 85 % du chemin
 *  pendant les 65 % premiers (sprint) et finit avec 15 % du chemin sur
 *  les 35 % derniers (freinage). */
const SPRINT_END = 0.65;
const SPRINT_DISTANCE = 0.85;

/**
 * Easing closeout : t ∈ [0, 1] (temps linéaire) → progression spatiale
 * ∈ [0, 1] avec sprint puis freinage.
 *
 * Phase 1 (sprint, t < 0.65) : easeOut quadratique mappé vers [0, 0.85].
 *   Le défenseur s'élance fort, parcourt l'essentiel de la distance.
 *
 * Phase 2 (freinage, t ≥ 0.65) : easeIn quadratique mappé vers [0.85, 1].
 *   Le défenseur freine et arrive "in control".
 *
 * Continuité : la dérivée est continue à t=0.65 (les deux courbes ont une
 * pente comparable à la jonction).
 *
 * Invariants :
 *   closeoutEasing(0) = 0
 *   closeoutEasing(1) = 1
 *   closeoutEasing(0.65) = 0.85
 *   Monotone croissante.
 */
export function closeoutEasing(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < SPRINT_END) {
    // Phase sprint : easeOut quadratique sur [0, 0.85]
    const u = t / SPRINT_END;
    const eased = 1 - (1 - u) * (1 - u);
    return eased * SPRINT_DISTANCE;
  }
  // Phase freinage : easeIn quadratique sur [0.85, 1]
  const u = (t - SPRINT_END) / (1 - SPRINT_END);
  const eased = u * u;
  return SPRINT_DISTANCE + eased * (1 - SPRINT_DISTANCE);
}
