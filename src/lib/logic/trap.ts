import type {
  Point,
  AttackerId,
  DefenderId,
  AttackerPositions,
  DefenderPositions,
  Matchups,
} from '../types';
import { distance } from './geometry';

// =============================================================
// Zones de trappe
// =============================================================
// Coins fond (baseline) + extensions limitées sur la ligne de touche.
// On reste sur le demi-terrain offensif : y bas ≈ proche du panier
// adverse, y haut ≈ vers le milieu de terrain.
// Définies par bbox plutôt que polygones convexes pour rester simple.

interface BBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const TRAP_ZONES: BBox[] = [
  // Coin gauche fond (baseline)
  { xMin: 20, xMax: 130, yMin: 20, yMax: 200 },
  // Coin droit fond (baseline)
  { xMin: 470, xMax: 580, yMin: 20, yMax: 200 },
  // Sideline gauche mi-terrain (au-delà du 3pt côté gauche, vers le milieu)
  { xMin: 20, xMax: 110, yMin: 200, yMax: 460 },
  // Sideline droite mi-terrain
  { xMin: 490, xMax: 580, yMin: 200, yMax: 460 },
];

/** True si le porteur est dans une zone de trappe.
 *
 * `hoop` : panier de référence côté défense. Si bottom (y > 540), on miroite
 * la position autour de la ligne médiane avant le test, pour que les zones
 * (définies pour HOOP top) s'appliquent symétriquement.
 */
export function isInTrapZone(carrierPos: Point, hoop?: Point): boolean {
  const p = hoop && hoop.y > 540
    ? { x: carrierPos.x, y: 2 * 540 - carrierPos.y }
    : carrierPos;
  return TRAP_ZONES.some(
    (z) =>
      p.x >= z.xMin &&
      p.x <= z.xMax &&
      p.y >= z.yMin &&
      p.y <= z.yMax
  );
}

/** Sélectionne le défenseur (autre que le carrierDef) le plus proche du
 *  porteur pour venir trapper. Retourne null si aucun candidat trouvable.
 *
 *  `excludeDefenders` (optionnel) : IDs additionnels à exclure du choix.
 *  Utilisé par la couche trap quand un écran est aussi en cours (Trap v3)
 *  pour éviter de choisir le `screenerDef` qui est déjà engagé sur l'écran. */
export function pickTrapHelper(
  off: AttackerPositions,
  defPositions: DefenderPositions,
  matchups: Matchups,
  ballCarrier: AttackerId,
  excludeDefenders?: ReadonlySet<DefenderId>
): DefenderId | null {
  let carrierDef: DefenderId | null = null;
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([d, o]) => {
    if (o === ballCarrier) carrierDef = d;
  });
  if (!carrierDef) return null;

  const carrier = off[ballCarrier];
  if (!carrier) return null;

  let best: DefenderId | null = null;
  let bestDist = Infinity;
  (Object.keys(defPositions) as DefenderId[]).forEach((dId) => {
    if (dId === carrierDef) return;
    if (excludeDefenders?.has(dId)) return;
    const d = distance(defPositions[dId], carrier);
    if (d < bestDist) {
      bestDist = d;
      best = dId;
    }
  });
  return best;
}

/** Position du second défenseur sur le porteur dans un trap : côté opposé au
 *  carrierDef pour fermer la cage, à ~28px du porteur. */
export function trapTarget(carrierPos: Point, carrierDefPos: Point): Point {
  const dx = carrierPos.x - carrierDefPos.x;
  const dy = carrierPos.y - carrierDefPos.y;
  const len = Math.hypot(dx, dy) || 1;
  // Vecteur unitaire du carrierDef vers le porteur, on continue dans cette
  // direction au-delà du porteur pour fermer le côté opposé.
  const ux = dx / len;
  const uy = dy / len;
  const offset = 28;
  return {
    x: carrierPos.x + ux * offset,
    y: carrierPos.y + uy * offset,
  };
}
