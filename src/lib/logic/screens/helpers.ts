// Helpers internes du moteur d'écrans. Pas exportés en surface — réutilisés
// par les modules detect / adjust (carrier + off-ball).
//
//  - `hasScreenIntent`  : filtre d'intention (vélocité du candidat poseur)
//  - `smoothstep`       : easing continu pour éviter les sauts au seuil
//  - `pushOutOfScreener`: maintient la clearance minimale autour du poseur
//  - `pushOutOfCarrier` : idem autour du porteur, avec direction préférée

import type { AttackerId, AttackerPositions, Point } from '../../types';
import { MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';

/**
 * Filtre d'intention pour la détection d'écran : un attaquant qui PASSE par
 * hasard près du couple porteur/défenseur n'est pas un poseur. On compare
 * sa distance à la cible (carrierDef ou cutterDef) entre l'étape précédente
 * et l'étape courante :
 *
 *  - s'il s'EST RAPPROCHÉ ou est STATIQUE → intention plausible, on garde.
 *  - s'il s'ÉLOIGNE (cur > prev) avec une velocity ≥ 5 px → écran fantôme
 *    (croisement, pas pose), on rejette.
 *
 * Sans historique (`prevOff` absent), on accepte : on n'a pas de quoi juger.
 */
export function hasScreenIntent(
  attackerId: AttackerId,
  curPos: Point,
  targetPos: Point,
  prevOff?: AttackerPositions
): boolean {
  if (!prevOff) return true;
  const prev = prevOff[attackerId];
  if (!prev) return true;
  const speed = Math.hypot(curPos.x - prev.x, curPos.y - prev.y);
  if (speed < 5) return true;
  const prevDist = Math.hypot(targetPos.x - prev.x, targetPos.y - prev.y);
  const curDist = Math.hypot(targetPos.x - curPos.x, targetPos.y - curPos.y);
  return curDist <= prevDist;
}

/**
 * Smoothstep continu sur [edge0, edge1]. Remplace les `Math.max(0, Math.min(1, x))`
 * pour éviter les discontinuités de dérivée aux bornes — ce qui crée un saut
 * visuel quand une distance franchit le seuil.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Garantit qu'un point cible n'est pas à l'intérieur du cercle du poseur
 * d'écran (deux joueurs ne peuvent pas se superposer physiquement). Si trop
 * proche, on pousse le point dans la direction opposée jusqu'à un dégagement
 * minimum.
 */
export function pushOutOfScreener(target: Point, screenerPos: Point): Point {
  const minClearance = MIN_PLAYER_CLEARANCE_PX;
  const dx = target.x - screenerPos.x;
  const dy = target.y - screenerPos.y;
  const d = Math.hypot(dx, dy);
  if (d >= minClearance || d < 0.01) return target;
  const k = minClearance / d;
  return {
    x: screenerPos.x + dx * k,
    y: screenerPos.y + dy * k,
  };
}

/**
 * Pousse un défenseur hors du porteur en respectant la clearance minimale.
 * `direction` (optionnel) impose le côté de poussée : utile en mode "under"
 * où D1 doit rester du côté opposé au panier, ou en "hedge agressif" où D5
 * doit rester côté panier. Si direction non fournie, pousse radialement.
 *
 * Crucial pour les écrans : sans cela, à faible quality D1/D5 peuvent
 * atterrir à <34px du porteur (chevauchement visuel) alors que la cible
 * a été calculée avec une amplitude < clearance.
 */
export function pushOutOfCarrier(
  target: Point,
  carrierPos: Point,
  preferredDir?: { x: number; y: number }
): Point {
  const minClearance = MIN_PLAYER_CLEARANCE_PX;
  const dx = target.x - carrierPos.x;
  const dy = target.y - carrierPos.y;
  const d = Math.hypot(dx, dy);
  if (d >= minClearance) return target;
  // Construction d'une direction de poussée CONTINUE :
  // - on part de la direction radiale (target - carrier), qui est toujours
  //   bien définie tant que d > 0.01.
  // - on AJOUTE la direction préférée (sideOfCarrier × perp) qui guide vers
  //   la bonne route (over/under/etc.). Quand sideOfCarrier ≈ 0, la
  //   préférée est ~nulle → on retombe sur le radial pur (continu).
  //   Quand sideOfCarrier ≈ ±1, la préférée domine → côté privilégié.
  // Cette somme normalisée évite les sauts à la transition de signe.
  let dirX = dx;
  let dirY = dy;
  if (d > 0.01) {
    dirX = dx / d;
    dirY = dy / d;
  } else {
    // Target colle au porteur. On part d'une orientation arbitraire +y.
    dirX = 0;
    dirY = 1;
  }
  if (preferredDir) {
    // On pondère la direction préférée par sa magnitude (sideOfCarrier ∈
    // [-1, 1]) — pas de normalisation, pour éviter le flip à magnitude faible.
    // Coefficient 2 pour que la préférée domine quand |sideOfCarrier| > 0.5.
    dirX += preferredDir.x * 2;
    dirY += preferredDir.y * 2;
  }
  const dlen = Math.hypot(dirX, dirY) || 1;
  return {
    x: carrierPos.x + (dirX / dlen) * minClearance,
    y: carrierPos.y + (dirY / dlen) * minClearance,
  };
}

/**
 * Pousse une cible hors de TOUS les poseurs (utile pour les écrans
 * non-porteur stagger/elevator). Appliqué dans l'ordre — l'ordre n'est
 * pas critique car chaque push ne déplace que si la cible est dans le
 * cercle du poseur considéré.
 */
export function pushOutOfScreeners(
  target: Point,
  screeners: Array<{ pos: Point }>
): Point {
  return screeners.reduce((p, s) => pushOutOfScreener(p, s.pos), target);
}
