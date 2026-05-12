// Règle 4 — Corner faible abandonné.
//
// Un coupeur en corner faible (côté opposé au porteur) sans défenseur
// proche risque le skip pour 3pts ouvert. Severity dépend de la distance :
//   > 180px  → 'critical' (libre)
//   > 130px  → 'warning'  ('critical' si shooter)

import type { AttackerId, DefenderId } from '../../../types';
import { distance } from '../../geometry';
import type { CoachDiagnostic, Rule } from '../types';
import { isCornerAttacker, isOutsideThreat, sideOf, withProfile } from '../helpers';

export const cornerAbandonedRule: Rule = (ctx) => {
  const { off, carrier, carrierSide, defPos, defenderIds, hoop, profiles } = ctx;
  const out: CoachDiagnostic[] = [];

  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    if (oId === carrier) return;
    const pos = off[oId];
    if (!isCornerAttacker(pos, hoop)) return;
    const attSide = sideOf(pos, hoop);
    // Côté faible = opposé au porteur. Si même côté que le ballon, c'est strong-corner.
    const isWeakCorner = attSide !== 0 && carrierSide !== 0 && attSide !== carrierSide;
    if (!isWeakCorner) return;

    // Distance au défenseur le plus proche.
    let nearestDist = Infinity;
    let nearestDef: DefenderId | null = null;
    defenderIds.forEach((dId) => {
      const d = defPos[dId];
      const dd = distance({ x: d.x, y: d.y }, pos);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearestDef = dId;
      }
    });

    const isShooter = isOutsideThreat(profiles?.[oId]);
    const oLabel = withProfile(oId, profiles?.[oId]);

    if (nearestDist > 180) {
      out.push({
        id: `corner-open-${oId}`,
        severity: 'critical',
        message: isShooter
          ? `Corner faible abandonné : ${oLabel} libre — skip 3pts critique`
          : `Corner faible abandonné : ${oLabel} libre — fermer la passe`,
        tag: 'corner-open',
        defenders: nearestDef ? [nearestDef] : [],
        attackers: [oId],
      });
    } else if (nearestDist > 130) {
      out.push({
        id: `corner-help-${oId}`,
        severity: isShooter ? 'critical' : 'warning',
        message: isShooter
          ? `Ne quitte pas ${oLabel} en corner faible — skip 3 cher`
          : `Corner faible : ${oLabel} laissé large par ${nearestDef ?? '?'}`,
        tag: 'corner-help',
        defenders: nearestDef ? [nearestDef] : [],
        attackers: [oId],
      });
    }
  });

  return out;
};
