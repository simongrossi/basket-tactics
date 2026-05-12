// Règle 1 — Closeout long / over-closeout sur le porteur.
//
// Détecte l'état du défenseur du porteur :
//  - `overClosed` (a couru trop loin, dépassé son homme) → 'critical'
//  - `late + closingOut` (closeout en cours mais en retard) → 'critical' si
//    le porteur est shooter, sinon 'warning'
//  - `late` simple (en retard mais pas en closeout actif) → 'warning'

import type { ComputedDefense, DefenderId } from '../../../types';
import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';

export const closeoutLongRule: Rule = (ctx) => {
  const { defPos, carrier, profiles } = ctx;
  const out: CoachDiagnostic[] = [];

  const carrierDef = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
    .find(([, p]) => p.matchedTo === carrier);
  if (!carrierDef) return out;

  const [dId, p] = carrierDef;
  const carrierLabel = withProfile(carrier, profiles?.[carrier]);

  if (p.overClosed) {
    out.push({
      id: `over-closeout-${dId}`,
      severity: 'critical',
      message: `${dId} se fait déborder — over-closeout sur ${carrierLabel}`,
      tag: 'over-closeout',
      defenders: [dId],
      attackers: [carrier],
    });
  } else if (p.late && p.closingOut) {
    out.push({
      id: `closeout-late-${dId}`,
      severity: isOutsideThreat(profiles?.[carrier]) ? 'critical' : 'warning',
      message: isOutsideThreat(profiles?.[carrier])
        ? `Closeout long : ${dId} en retard sur ${carrierLabel} — tir 3 ouvert`
        : `Closeout long : ${dId} arrive en retard sur ${carrierLabel}`,
      tag: 'closeout-long',
      defenders: [dId],
      attackers: [carrier],
    });
  } else if (p.late) {
    out.push({
      id: `late-${dId}`,
      severity: 'warning',
      message: `${dId} en retard sur ${carrierLabel}`,
      tag: 'late',
      defenders: [dId],
      attackers: [carrier],
    });
  }

  return out;
};
