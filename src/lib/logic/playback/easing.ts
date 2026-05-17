// D.1 — Fonctions d'easing pures pour le lissage cross-step.
//
// Toutes les fonctions respectent les invariants `e(0) = 0` et `e(1) = 1`,
// donc les snapshots exacts aux index entiers de step restent identiques.
// Seules les valeurs intermédiaires sont modulées.

export type MovementEasing = 'linear' | 'ease-in-out' | 'ease-out';

/** Linéaire (identité) — comportement legacy. */
export function easeLinear(t: number): number {
  return t;
}

/** Ease in-out cosinus — démarrage lent + accélération milieu + ralenti fin.
 *  Symétrique autour de t=0.5. */
export function easeInOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** Ease out cubique — démarrage rapide + ralenti progressif. Typique d'un
 *  closeout qui sprint puis freine. */
export function easeOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

/** Sélecteur centralisé. */
export function applyEasing(t: number, kind: MovementEasing | undefined): number {
  if (!kind || kind === 'linear') return t;
  if (kind === 'ease-in-out') return easeInOut(t);
  if (kind === 'ease-out') return easeOut(t);
  return t;
}
