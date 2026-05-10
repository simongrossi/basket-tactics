import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  Point,
} from '../types';
import { distance, pointToSegmentDistance } from './geometry';

/**
 * Système universel de "réflexes défensifs" — Étape 3.
 *
 * Détecte les menaces vers le panier (free-path / drive / cut imminent) et
 * désigne un couvreur (rim protector) pour chaque menace. C'est la règle
 * basket fondamentale "pas d'easy basket" : peu importe le matchup ou la
 * zone, si un attaquant a un couloir libre vers le panier, le défenseur le
 * mieux placé doit fermer.
 *
 * Le résultat alimente :
 *  - zoneDefense.ts : boost de claim sur le couvreur + bias home
 *  - coachDiagnostics.ts : phrase coach "easy basket ouvert"
 *  - (à venir) baseTargets.ts pour la défense individuelle
 */

const FREE_PATH_PERP_PX = 80;
const FREE_PATH_DIST_TO_HOOP_MAX_PX = 220;
const CUT_MIN_DELTA_DHOOP_PX = 25;
const CUT_MAX_DHOOP_PX = 250;
const CUT_NEAR_TEAMMATE_PX = 30;

export interface FreePathThreat {
  attacker: AttackerId;
  pos: Point;
  /** Distance de l'attaquant au panier. < urgent. */
  distToHoop: number;
  /**
   * Défenseur désigné couvreur (le plus proche du panier parmi ceux non
   * encore engagés sur cette menace).
   */
  designated: DefenderId | null;
  /**
   * Distance perpendiculaire entre le défenseur le plus proche du couloir
   * et le segment attaquant→panier. > FREE_PATH_PERP_PX = couloir libre.
   */
  closestPerpDist: number;
  /**
   * Urgence 0..1 : 1 = attaquant très proche du panier sans défenseur.
   * Sert à pondérer les boosts si plusieurs menaces simultanées.
   */
  urgency: number;
}

export interface ThreatDefenderInput {
  x: number;
  y: number;
}

export interface Cut {
  cutter: AttackerId;
  pos: Point;
  prevPos: Point;
  /** Δ dHoop entre prev et current (positif = se rapproche du panier). */
  deltaToHoop: number;
  /** Côté du terrain (-1 G, 0 centre, 1 D). */
  side: -1 | 0 | 1;
  /** Le défenseur naturel le plus loin du cutter (en sag) si applicable. */
  cutterDefDistance: number | null;
}

/**
 * Détecte les menaces de "free path" (couloir libre vers le panier) parmi
 * les attaquants suffisamment proches du panier.
 *
 * Critères pour qu'un attaquant soit menaçant :
 *  - distToHoop < 220 px (~6m, bande dangereuse — drive imminent ou cut)
 *  - aucun défenseur à moins de 80 px du segment attaquant→panier
 *
 * Le défenseur désigné couvreur est celui qui :
 *  1. n'est pas déjà désigné pour un autre threat (urgence supérieure)
 *  2. est le plus proche du PANIER (pas de l'attaquant) — pour préserver la
 *     position défensive entre attaquant et panier
 */
export function detectFreePathThreats(
  off: AttackerPositions,
  hoop: Point,
  defPositions: Record<string, ThreatDefenderInput>,
  unavailable: Set<DefenderId> = new Set()
): FreePathThreat[] {
  const defenderIds = Object.keys(defPositions) as DefenderId[];
  // Défenseurs disponibles pour fermer le couloir : exclut ceux déjà désignés
  // pour d'autres responsabilités (high-post, baseline-drive, ball-pressure).
  // Sans cette exclusion, le détecteur considérerait à tort qu'un défenseur
  // "proche par homePos" mais structurellement engagé ailleurs ferme la ligne.
  const availableIds = defenderIds.filter((id) => !unavailable.has(id));
  const threats: FreePathThreat[] = [];

  // Trie les attaquants par distance au panier (les plus dangereux d'abord).
  const ranked = (Object.entries(off) as [AttackerId, Point][])
    .map(([id, pos]) => ({ id, pos, dHoop: distance(pos, hoop) }))
    .filter((a) => a.dHoop < FREE_PATH_DIST_TO_HOOP_MAX_PX)
    .sort((a, b) => a.dHoop - b.dHoop);

  const localAssigned = new Set<DefenderId>(unavailable);

  for (const att of ranked) {
    if (availableIds.length === 0) break;

    // Distance perpendiculaire des défenseurs DISPONIBLES au segment
    // attaquant→panier. Si quelqu'un ferme déjà le couloir → pas de menace.
    const perpDistances = availableIds.map((id) => ({
      id,
      perpDist: pointToSegmentDistance(
        { x: defPositions[id].x, y: defPositions[id].y },
        att.pos,
        hoop
      ),
    }));
    const closest = perpDistances.reduce((a, b) => (a.perpDist < b.perpDist ? a : b));
    if (closest.perpDist <= FREE_PATH_PERP_PX) continue;

    // Désigner le défenseur disponible le plus proche du PANIER (préserve la
    // défense basket-side) qui n'est pas déjà assigné à une autre menace.
    const candidates = availableIds
      .filter((id) => !localAssigned.has(id))
      .map((id) => ({
        id,
        dHoop: distance({ x: defPositions[id].x, y: defPositions[id].y }, hoop),
      }))
      .sort((a, b) => a.dHoop - b.dHoop);

    const designated = candidates[0]?.id ?? null;
    if (designated) localAssigned.add(designated);

    const urgency = Math.max(0, 1 - att.dHoop / FREE_PATH_DIST_TO_HOOP_MAX_PX);

    threats.push({
      attacker: att.id,
      pos: att.pos,
      distToHoop: att.dHoop,
      designated,
      closestPerpDist: closest.perpDist,
      urgency,
    });
  }

  return threats;
}

/**
 * Détecte les cuts hors-ballon (mouvement net vers le panier d'un attaquant
 * non porteur). Couvre les coupes flash, backdoor, ball-side cuts.
 *
 * Critères :
 *  - L'attaquant n'est pas le porteur
 *  - dHoop courant < 250 px (le cutter est dans la zone d'attaque)
 *  - delta dHoop entre prev et current step > 25 px (mouvement net)
 *  - Pas en train de poser un écran (aucun coéquipier à <30 px sur la
 *    trajectoire) — sinon c'est un screener qui descend, pas un cutter
 *
 * Le résultat alimente coachDiagnostics ("backdoor cut from O3") et peut
 * servir à 3.a (le cutter sera de toute façon détecté comme free-path
 * threat s'il est proche du panier sans couvreur).
 */
export function detectCuts(
  off: AttackerPositions,
  prevOff: AttackerPositions,
  ballCarrier: AttackerId,
  hoop: Point,
  defPositions: Record<string, ThreatDefenderInput> | null = null,
  matchups: Record<DefenderId, AttackerId> | null = null
): Cut[] {
  const cuts: Cut[] = [];
  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
    if (oId === ballCarrier) return;
    const prevPos = prevOff[oId];
    if (!prevPos) return;

    const dHoopCur = distance(pos, hoop);
    const dHoopPrev = distance(prevPos, hoop);
    const delta = dHoopPrev - dHoopCur;

    if (dHoopCur >= CUT_MAX_DHOOP_PX) return;
    if (delta < CUT_MIN_DELTA_DHOOP_PX) return;

    // Filtrer les screeners qui descendent : si un coéquipier est très
    // proche (<30 px) et dans la même direction de mouvement, c'est un
    // screen-action, pas un cut.
    const isLikelyScreener = (Object.entries(off) as [AttackerId, Point][]).some(
      ([oId2, pos2]) => oId2 !== oId && distance(pos2, pos) < CUT_NEAR_TEAMMATE_PX
    );
    if (isLikelyScreener) return;

    const side: -1 | 0 | 1 =
      pos.x < hoop.x - 30 ? -1 : pos.x > hoop.x + 30 ? 1 : 0;

    let cutterDefDistance: number | null = null;
    if (defPositions && matchups) {
      const cutterDef = (Object.entries(matchups) as [DefenderId, AttackerId][])
        .find(([, oId2]) => oId2 === oId)?.[0];
      if (cutterDef && defPositions[cutterDef]) {
        cutterDefDistance = distance(
          { x: defPositions[cutterDef].x, y: defPositions[cutterDef].y },
          pos
        );
      }
    }

    cuts.push({
      cutter: oId,
      pos,
      prevPos,
      deltaToHoop: delta,
      side,
      cutterDefDistance,
    });
  });
  return cuts;
}

