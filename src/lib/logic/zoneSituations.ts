import type { AttackerPositions, AttackerId, Point } from '../types';
import { HOOP } from '../data/court';

/**
 * Module utilitaire pour identifier des situations tactiques particulières
 * en défense de zone : overload côté ballon, short corner, high post,
 * skip pass. Ces situations modulent le comportement du moteur ownership
 * (zoneDefense.ts) pour le faire ressembler à une vraie zone.
 *
 * Vocabulaire :
 *  - overload  : 3+ attaquants concentrés du côté du ballon → la zone
 *                doit glisser plus fort vers ce côté.
 *  - short corner : zone "trou" entre le coin et le bloc bas. Tueur en
 *                   2-3 et 3-2. Vue de la défense : si un attaquant
 *                   campe ici, il faut le couvrir explicitement.
 *  - high post : sommet de la raquette. Tueur en 1-3-1 (passe à la
 *                FT line déchire la zone). Doit être couvert.
 *  - skip pass : passe traversante d'un côté à l'autre (porteur change
 *                de moitié de terrain). Force la zone à tourner.
 */

/** Un attaquant est "côté G" si x < 300 - 30 (centre - tolérance), "côté D"
 *  si x > 300 + 30, "central" sinon. Renvoie -1 / 0 / 1. */
export function attackerSide(pos: Point, hoop: Point = HOOP): -1 | 0 | 1 {
  const dx = pos.x - hoop.x;
  if (Math.abs(dx) < 30) return 0;
  return dx > 0 ? 1 : -1;
}

export interface OverloadInfo {
  /** Côté du ballon (-1 G, 0 central, 1 D). */
  side: -1 | 0 | 1;
  /** Nombre d'attaquants côté ballon (excluant les centraux). */
  count: number;
  /** Intensité 0..1 pour moduler le glissement. 0 = équilibré (≤2),
   *  0.6 = overload classique (3), 1.0 = overload sévère (4+). */
  intensity: number;
}

/** Détecte un overload côté ballon. */
export function detectOverload(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  hoop: Point = HOOP
): OverloadInfo {
  const ballPos = off[ballCarrier];
  if (!ballPos) return { side: 0, count: 0, intensity: 0 };
  const ballSide = attackerSide(ballPos, hoop);
  if (ballSide === 0) return { side: 0, count: 0, intensity: 0 };
  let count = 0;
  (Object.values(off) as Point[]).forEach((p) => {
    if (attackerSide(p, hoop) === ballSide) count++;
  });
  // Échelle : 3 attaquants côté = overload modéré, 4+ = sévère.
  const intensity = count >= 4 ? 1.0 : count >= 3 ? 0.6 : 0;
  return { side: ballSide, count, intensity };
}

/**
 * Short corner : zone entre le coin baseline et le bloc bas, hors raquette
 * mais très proche du panier. Tueur en zone car aucun défenseur n'a
 * naturellement ce poste dans une 2-3 ou 3-2.
 *
 * Critère : distance au panier 60-130px ET latéralement >130px (hors raquette
 * qui fait ±100px de large autour du panier).
 */
export function isShortCorner(pos: Point, hoop: Point = HOOP): boolean {
  const dHoop = Math.hypot(pos.x - hoop.x, pos.y - hoop.y);
  const lateral = Math.abs(pos.x - hoop.x);
  return dHoop > 60 && dHoop < 130 && lateral > 130;
}

/**
 * High post : sommet de la raquette / FT line. Tueur en 1-3-1 et 2-3 car
 * la passe à la FT line ouvre les angles vers les ailiers et la baseline.
 *
 * Critère : centré (lateral <60px) ET 130-200px du panier.
 */
export function isHighPost(pos: Point, hoop: Point = HOOP): boolean {
  const lateral = Math.abs(pos.x - hoop.x);
  const verticalFromHoop = Math.abs(pos.y - hoop.y);
  return lateral < 60 && verticalFromHoop > 130 && verticalFromHoop < 200;
}

/**
 * Identifie un attaquant en zone-tueuse (short corner OU high post). Retourne
 * la liste des attaquants concernés, avec le label de zone, pour adresser
 * les diagnostics et le boost de claim.
 */
export interface CriticalZoneAttacker {
  attackerId: AttackerId;
  zone: 'short-corner' | 'high-post';
  pos: Point;
}

export function findCriticalZoneAttackers(
  off: AttackerPositions,
  hoop: Point = HOOP
): CriticalZoneAttacker[] {
  const result: CriticalZoneAttacker[] = [];
  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
    if (isShortCorner(pos, hoop)) {
      result.push({ attackerId: oId, zone: 'short-corner', pos });
    } else if (isHighPost(pos, hoop)) {
      result.push({ attackerId: oId, zone: 'high-post', pos });
    }
  });
  return result;
}

/**
 * Détecte un skip pass : le porteur a changé de moitié de terrain entre
 * l'étape précédente et l'étape courante. La zone doit tourner avec un
 * délai (déjà géré naturellement par la contrainte de vitesse, mais on
 * marque l'événement pour les diagnostics).
 */
export interface SkipPassInfo {
  fromSide: -1 | 0 | 1;
  toSide: -1 | 0 | 1;
}

export function detectSkipPass(
  prevOff: AttackerPositions | null,
  off: AttackerPositions,
  prevCarrier: AttackerId | null,
  carrier: AttackerId,
  hoop: Point = HOOP
): SkipPassInfo | null {
  if (!prevOff || !prevCarrier) return null;
  // Skip = changement de porteur ET changement de côté
  if (prevCarrier === carrier) return null;
  const prevPos = prevOff[prevCarrier];
  const newPos = off[carrier];
  if (!prevPos || !newPos) return null;
  const fromSide = attackerSide(prevPos, hoop);
  const toSide = attackerSide(newPos, hoop);
  if (fromSide === 0 || toSide === 0 || fromSide === toSide) return null;
  return { fromSide, toSide };
}
