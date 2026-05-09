import type {
  AttackerPositions,
  DefenderId,
  AttackerId,
  Matchups,
  Point,
  DetectedScreen,
  DefenderPositions,
} from '../types';
import { distance } from './geometry';
import {
  type DetectedScreenAction,
  actionRequiresLowManTag,
} from './screenAction';

/**
 * Rôle assigné par les rotations PnR (low-man tag + X-out + stunt).
 * Permet à l'engine d'overrider les targets ET de tagger le défenseur
 * pour highlight UI.
 */
export interface PnRRotationOverride {
  defender: DefenderId;
  target: Point;
  role: 'tag' | 'x-out' | 'stunt';
  /** Phrase courte pour les diagnostics ("D4 tag le roll de O5"). */
  reason: string;
}

/**
 * Calcule les overrides de rotation à appliquer sur la défense pendant un
 * pick-and-roll. Trois rotations possibles :
 *
 *  1. **Low-man tag** : sur roll/short-roll/slip, le défenseur back-side
 *     faible le plus proche du panier reçoit une cible de tag (entre le
 *     roller et le panier, à 30% du chemin depuis le roller).
 *  2. **X-out** : l'attaquant que le low-man marquait initialement est
 *     orphelin. Le défenseur dont l'homme est le plus proche de cet
 *     orphelin se déplace à mi-chemin vers lui (rotation de couverture).
 *  3. **Nail stunt** : le défenseur en position high-post fait un faux
 *     mouvement vers le porteur (25% du chemin) pour dissuader le drive.
 *     Pas un vrai aide, juste de la pression visuelle.
 *
 * Retourne la liste des défenseurs affectés. Vide si :
 *  - l'action n'exige pas de rotation (pop, ghost, reject, snake, re-screen)
 *  - aucun défenseur candidat (système incompatible — ex. zone)
 */
export function computePnRRotations(
  off: AttackerPositions,
  matchups: Matchups,
  screen: DetectedScreen,
  action: DetectedScreenAction,
  defenderTargets: Record<DefenderId, Point>,
  hoop: Point,
  defenseInitial: DefenderPositions
): PnRRotationOverride[] {
  if (!actionRequiresLowManTag(action.kind)) return [];

  const rollerPos = off[screen.screener];
  if (!rollerPos) return [];
  const carrierPos = off[screen.carrier];
  if (!carrierPos) return [];
  const overrides: PnRRotationOverride[] = [];
  const defenderIds = Object.keys(defenderTargets) as DefenderId[];

  // -----------------------------------------------------------------------
  // 1. Identifier le low-man : défenseur weak-side, le plus proche du panier,
  //    excluant carrierDef et screenerDef. "Weak-side" = matchedTo de l'autre
  //    côté du terrain par rapport au porteur.
  // -----------------------------------------------------------------------
  const carrierSide = Math.sign(carrierPos.x - hoop.x) || 0;
  let lowMan: DefenderId | null = null as DefenderId | null;
  let lowManDistToHoop = Infinity;
  defenderIds.forEach((dId) => {
    if (dId === screen.carrierDef || dId === screen.screenerDef) return;
    const myAtt = matchups[dId];
    const myAttPos = off[myAtt];
    if (!myAttPos) return;
    const myAttSide = Math.sign(myAttPos.x - hoop.x) || 0;
    // On veut un défenseur weak-side OU un défenseur dont l'homme est central
    // (à <30px de l'axe panier). Évite de prendre un défenseur strong-side
    // qui ne peut physiquement pas tagger.
    const isWeakOrCentral = myAttSide === 0 || myAttSide !== carrierSide;
    if (!isWeakOrCentral) return;
    const dPos = defenderTargets[dId];
    if (!dPos) return;
    const distToHoop = distance(dPos, hoop);
    if (distToHoop < lowManDistToHoop) {
      lowManDistToHoop = distToHoop;
      lowMan = dId;
    }
  });

  if (!lowMan) return overrides;
  const lowManId: DefenderId = lowMan;

  // -----------------------------------------------------------------------
  // 2. Cible de tag : sur la ligne roller→panier, à ~35% depuis le roller.
  //    Le défenseur "bumpe" le roller juste avant le cercle.
  // -----------------------------------------------------------------------
  const tagPos: Point = {
    x: rollerPos.x + (hoop.x - rollerPos.x) * 0.35,
    y: rollerPos.y + (hoop.y - rollerPos.y) * 0.35,
  };
  overrides.push({
    defender: lowManId,
    target: tagPos,
    role: 'tag',
    reason: `${lowManId} tag le ${action.kind} de ${screen.screener}`,
  });

  // -----------------------------------------------------------------------
  // 3. X-out : l'homme du low-man est orphelin. Le défenseur dont l'homme
  //    est le plus proche de cet orphelin (excluant carrierDef, screenerDef,
  //    lowMan) glisse à mi-chemin vers l'orphelin pour fermer la passe.
  // -----------------------------------------------------------------------
  const orphan: AttackerId = matchups[lowManId];
  const orphanPos = off[orphan];
  if (orphanPos) {
    let xOutDef: DefenderId | null = null as DefenderId | null;
    let xOutBestDist = Infinity;
    defenderIds.forEach((dId) => {
      if (dId === screen.carrierDef || dId === screen.screenerDef || dId === lowManId) return;
      const myAtt = matchups[dId];
      const myAttPos = off[myAtt];
      if (!myAttPos) return;
      const d = distance(myAttPos, orphanPos);
      if (d < xOutBestDist) {
        xOutBestDist = d;
        xOutDef = dId;
      }
    });
    if (xOutDef) {
      const xOutId: DefenderId = xOutDef;
      const myAtt = matchups[xOutId];
      const myAttPos = off[myAtt];
      // Cible X-out : à mi-chemin entre la position normale (entre myAtt et
      // panier) et l'orphan. On part de la cible courante du défenseur (qui
      // contient déjà ses ajustements stance/help) et on shift de 50% vers
      // l'orphan. Évite que le défenseur abandonne complètement son homme.
      const baseTarget = defenderTargets[xOutId];
      if (!baseTarget) return overrides;
      const xOutTarget: Point = {
        x: baseTarget.x + (orphanPos.x - baseTarget.x) * 0.5,
        y: baseTarget.y + (orphanPos.y - baseTarget.y) * 0.5,
      };
      // Si la cible X-out finit dans le poseur d'écran, on garde la base.
      // (sécurité contre superposition — résolveur final s'en occupera aussi)
      overrides.push({
        defender: xOutId,
        target: xOutTarget,
        role: 'x-out',
        reason: `${xOutId} X-out sur ${orphan} (laissé par ${lowManId})`,
      });
      // Suppress unused-warning : myAttPos est utilisé dans la sélection.
      void myAttPos;
    }
  }

  // -----------------------------------------------------------------------
  // 4. Nail stunt : défenseur du high-post fait un mouvement de dissuasion
  //    sur le porteur. Heuristique : défenseur dont l'homme est dans la zone
  //    haute centrale (à <90px latéralement de l'axe panier ET entre 80-200px
  //    du panier verticalement). Stunt = 25% du chemin vers le porteur.
  // -----------------------------------------------------------------------
  let nailDef: DefenderId | null = null as DefenderId | null;
  defenderIds.forEach((dId) => {
    if (
      dId === screen.carrierDef ||
      dId === screen.screenerDef ||
      dId === lowManId ||
      overrides.some((o) => o.defender === dId)
    ) return;
    const myAtt = matchups[dId];
    const myAttPos = off[myAtt];
    if (!myAttPos) return;
    const lateral = Math.abs(myAttPos.x - hoop.x);
    const verticalFromHoop = Math.abs(myAttPos.y - hoop.y);
    if (lateral < 90 && verticalFromHoop > 80 && verticalFromHoop < 200) {
      nailDef = dId;
    }
  });
  if (nailDef) {
    const nailId: DefenderId = nailDef;
    const baseTarget = defenderTargets[nailId];
    if (!baseTarget) return overrides;
    const stuntTarget: Point = {
      x: baseTarget.x + (carrierPos.x - baseTarget.x) * 0.25,
      y: baseTarget.y + (carrierPos.y - baseTarget.y) * 0.25,
    };
    overrides.push({
      defender: nailId,
      target: stuntTarget,
      role: 'stunt',
      reason: `${nailId} stunt nail sur ${screen.carrier}`,
    });
  }

  // defenseInitial est passé pour usage potentiel futur (recover) — silence le linter.
  void defenseInitial;

  return overrides;
}
