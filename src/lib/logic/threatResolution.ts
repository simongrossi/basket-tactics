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
/** Bande étendue pour les attaquants en mouvement vers le panier (drive,
 *  cut profond) : on détecte la menace plus tôt pour permettre le step-up
 *  préventif. Au-delà de 280 px, on considère que la défense a le temps. */
const FREE_PATH_DIST_TO_HOOP_DRIVING_PX = 280;
const FREE_PATH_DRIVING_DELTA_PX = 20;
const CUT_MIN_DELTA_DHOOP_PX = 25;
const CUT_MAX_DHOOP_PX = 250;
const CUT_NEAR_TEAMMATE_PX = 30;
/** Distance perpendiculaire au-delà de laquelle la ligne de passe est dite
 *  "ouverte". Plus permissif que FREE_PATH (60 vs 80) car une passe n'a pas
 *  besoin d'un défenseur exactement sur la trajectoire pour être contestée. */
const OPEN_PASS_PERP_PX = 60;
/** Distance minimale entre porteur et receveur pour considérer la passe
 *  comme "menaçante". En-dessous (15px) c'est un hand-off, pas une vraie passe. */
const OPEN_PASS_MIN_LEN_PX = 80;

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
  unavailable: Set<DefenderId> = new Set(),
  prevOff: AttackerPositions | null = null
): FreePathThreat[] {
  const defenderIds = Object.keys(defPositions) as DefenderId[];
  // Défenseurs disponibles pour fermer le couloir : exclut ceux déjà désignés
  // pour d'autres responsabilités (high-post, baseline-drive, ball-pressure).
  // Sans cette exclusion, le détecteur considérerait à tort qu'un défenseur
  // "proche par homePos" mais structurellement engagé ailleurs ferme la ligne.
  const availableIds = defenderIds.filter((id) => !unavailable.has(id));
  const threats: FreePathThreat[] = [];

  // Trie les attaquants par distance au panier (les plus dangereux d'abord).
  // - Toujours menace si dHoop < 220 (free-path statique)
  // - Aussi menace si 220 <= dHoop < 280 ET mouvement vers panier (drive en
  //   cours) : permet le step-up préventif avant que l'attaquant arrive.
  const ranked = (Object.entries(off) as [AttackerId, Point][])
    .map(([id, pos]) => {
      const dHoop = distance(pos, hoop);
      const prevPos = prevOff?.[id];
      const deltaTowardHoop = prevPos
        ? distance(prevPos, hoop) - dHoop
        : 0;
      return { id, pos, dHoop, deltaTowardHoop };
    })
    .filter((a) => {
      if (a.dHoop < FREE_PATH_DIST_TO_HOOP_MAX_PX) return true;
      if (
        a.dHoop < FREE_PATH_DIST_TO_HOOP_DRIVING_PX &&
        a.deltaTowardHoop > FREE_PATH_DRIVING_DELTA_PX
      )
        return true;
      return false;
    })
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

    // Urgence : 1 quand dHoop=0, 0 à FREE_PATH_DIST_TO_HOOP_DRIVING_PX (=280).
    // Échelle linéaire qui inclut la bande étendue "drive en cours".
    const urgency = Math.max(0, 1 - att.dHoop / FREE_PATH_DIST_TO_HOOP_DRIVING_PX);

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

export interface OpenPassThreat {
  /** Receveur potentiel de la passe ouverte. */
  receiver: AttackerId;
  /** Position du receveur. */
  receiverPos: Point;
  /** Distance perp du défenseur le plus proche au segment porteur→receveur. */
  closestPerpDist: number;
  /** Défenseur désigné couvreur de la passe (intercept du couloir). */
  designated: DefenderId | null;
  /** Point d'interception suggéré : mi-chemin sur la ligne de passe. */
  interceptPoint: Point;
  /** Distance receveur ↔ panier (les passes vers le panier sont plus urgentes). */
  receiverDistToHoop: number;
  /** Urgence 0..1 : plus le receveur est proche du panier OU plus la passe est
   *  ouverte, plus l'urgence est forte. */
  urgency: number;
}

/**
 * Détecte les lignes de passe ouvertes depuis le porteur vers ses coéquipiers.
 * Pour chaque attaquant non-porteur, on vérifie si le segment porteur→attaquant
 * est "libre" (aucun défenseur dans 60 px du segment). Si oui, on désigne le
 * défenseur le plus proche du point d'interception comme couvreur de la passe.
 *
 * Diffère de detectFreePathThreats (qui vise les attaquants proches du panier)
 * en couvrant les passes périmétriques skip et extra-pass : un shooter ouvert
 * à 250px du panier est une menace même s'il n'est pas en drive.
 *
 * Le couvreur désigné est choisi parmi les défenseurs DISPONIBLES (exclus :
 * carrierDef, déjà désignés sur d'autres menaces).
 * Les receveurs déjà couverts sont exclus AVANT les désignations : une
 * menace ignorée ensuite ne doit pas réserver un défenseur disponible.
 */
export function detectOpenPassThreats(
  off: AttackerPositions,
  carrier: AttackerId,
  hoop: Point,
  defPositions: Record<string, ThreatDefenderInput>,
  unavailable: Set<DefenderId> = new Set(),
  matchups: Record<string, AttackerId> | null = null,
  coveredReceivers: ReadonlySet<AttackerId> = new Set()
): OpenPassThreat[] {
  const carrierPos = off[carrier];
  if (!carrierPos) return [];
  const defenderIds = Object.keys(defPositions) as DefenderId[];
  const availableIds = defenderIds.filter((id) => !unavailable.has(id));
  if (availableIds.length === 0) return [];

  const threats: OpenPassThreat[] = [];
  const localAssigned = new Set<DefenderId>(unavailable);

  // Trie les receveurs potentiels par menace : plus proche du panier d'abord
  // (passe la plus dangereuse), puis les autres.
  const ranked = (Object.entries(off) as [AttackerId, Point][])
    .filter(([id]) => id !== carrier && !coveredReceivers.has(id))
    .map(([id, pos]) => ({
      id,
      pos,
      dHoop: distance(pos, hoop),
      passLen: distance(pos, carrierPos),
    }))
    .filter((r) => r.passLen > OPEN_PASS_MIN_LEN_PX)
    .sort((a, b) => a.dHoop - b.dHoop);

  for (const r of ranked) {
    // Distance perp des défenseurs au segment porteur→receveur.
    const perpDistances = availableIds.map((id) => ({
      id,
      perpDist: pointToSegmentDistance(
        { x: defPositions[id].x, y: defPositions[id].y },
        carrierPos,
        r.pos
      ),
    }));
    const closest = perpDistances.reduce((a, b) => (a.perpDist < b.perpDist ? a : b));
    if (closest.perpDist <= OPEN_PASS_PERP_PX) continue;

    // Point d'interception : mi-chemin sur la ligne de passe.
    const interceptPoint = {
      x: (carrierPos.x + r.pos.x) / 2,
      y: (carrierPos.y + r.pos.y) / 2,
    };

    // Désignation :
    //  1. Préférer le défenseur naturel du receveur (baseMatchups) s'il est
    //     disponible — c'est lui qui doit naturellement deny la passe sur
    //     son homme. Évite que le pivot ferme un skip pass perimetrique.
    //  2. Sinon, le défenseur disponible le plus proche du point d'interception,
    //     mais SEULEMENT si l'intercept est physiquement à portée (< 220 px de
    //     son home) — au-delà, le défenseur ne peut pas réalistement intercepter.
    let designated: DefenderId | null = null;
    if (matchups) {
      const naturalDef = (Object.entries(matchups) as [DefenderId, AttackerId][])
        .find(([d, o]) => o === r.id && !localAssigned.has(d) && availableIds.includes(d))?.[0];
      if (naturalDef) designated = naturalDef;
    }
    if (!designated) {
      const candidates = availableIds
        .filter((id) => !localAssigned.has(id))
        .map((id) => ({
          id,
          d: distance({ x: defPositions[id].x, y: defPositions[id].y }, interceptPoint),
        }))
        .filter((c) => c.d < 220)
        .sort((a, b) => a.d - b.d);
      designated = candidates[0]?.id ?? null;
    }
    if (designated) localAssigned.add(designated);
    if (!designated) continue;

    // Urgence : combine proximité receveur↔panier (1.0 si rim, 0 si très loin)
    // et ouverture du couloir (perpDist proche de 60 = faiblement urgent,
    // perpDist élevé = très urgent). On amplifie les passes "rim" car elles
    // donnent des tirs faciles.
    const proximityScore = Math.max(0, 1 - r.dHoop / 300);
    const openScore = Math.min(1, (closest.perpDist - OPEN_PASS_PERP_PX) / 80);
    const urgency = 0.4 * proximityScore + 0.6 * openScore;

    threats.push({
      receiver: r.id,
      receiverPos: r.pos,
      closestPerpDist: closest.perpDist,
      designated,
      interceptPoint,
      receiverDistToHoop: r.dHoop,
      urgency,
    });
  }

  return threats;
}

export interface MatchupOrphan {
  defender: DefenderId;
  /** Distance courante du défenseur à son homePos. Indique l'aide en cours. */
  defDisplacement: number;
  /** Le matchup naturel (baseMatchups) du défenseur. */
  naturalAttacker: AttackerId;
  /** Position de l'attaquant. */
  attackerPos: Point;
  /** Distance entre l'attaquant et son défenseur le plus proche. */
  closestDefDistance: number;
}

/**
 * Détecte les "matchup orphans" : un défenseur déplacé en aide (loin de son
 * homePos) DONT le matchup naturel n'est plus couvert (attaquant à >100 px du
 * plus proche défenseur). Sert à alerter le coach que la rotation est en
 * retard ou que le défenseur n'est pas revenu sur son homme.
 *
 * C'est un diagnostic, pas une force corrective : le moteur ne peut pas
 * "téléporter" le défenseur. Le coach voit qu'il y a un trou et peut
 * réajuster les directives ou la position.
 */
export function detectMatchupOrphans(
  off: AttackerPositions,
  defPositions: Record<string, ThreatDefenderInput>,
  homePositions: Record<string, ThreatDefenderInput>,
  baseMatchups: Record<string, AttackerId>
): MatchupOrphan[] {
  const orphans: MatchupOrphan[] = [];
  const defenderIds = Object.keys(defPositions) as DefenderId[];

  defenderIds.forEach((dId) => {
    const naturalAtt = baseMatchups[dId];
    if (!naturalAtt) return;
    const attackerPos = off[naturalAtt];
    if (!attackerPos) return;

    const defPos = defPositions[dId];
    const homePos = homePositions[dId];
    if (!defPos || !homePos) return;

    const defDisplacement = distance(
      { x: defPos.x, y: defPos.y },
      { x: homePos.x, y: homePos.y }
    );
    if (defDisplacement < 100) return; // pas vraiment déplacé

    // Plus proche défenseur de l'attaquant orphelin (n'importe lequel).
    let closestDist = Infinity;
    defenderIds.forEach((otherD) => {
      const dp = defPositions[otherD];
      const d = distance({ x: dp.x, y: dp.y }, attackerPos);
      if (d < closestDist) closestDist = d;
    });

    if (closestDist > 100) {
      orphans.push({
        defender: dId,
        defDisplacement,
        naturalAttacker: naturalAtt,
        attackerPos,
        closestDefDistance: closestDist,
      });
    }
  });

  return orphans;
}
