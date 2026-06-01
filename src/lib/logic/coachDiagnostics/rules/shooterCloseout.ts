// Règle — Closeout de qualité dégradée sur shooter/stretch-big.
//
// Quand le porteur vient de recevoir une skip pass et est un tireur extérieur,
// vérifier que le closeout est 'clean'. Si 'desperate' → warning, si 'late' → critical.
// Complément de closeoutLongRule (qui détecte la lateness générale, pas la
// qualité spécifique du closeout sur un shooter).

import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';
import type { DefenderId } from '../../../types';

export const shooterCloseoutRule: Rule = (ctx) => {
  const { defPos, carrier, profiles } = ctx;
  const out: CoachDiagnostic[] = [];

  // Seulement pertinent si le porteur est un tireur extérieur.
  if (!isOutsideThreat(profiles?.[carrier])) return out;

  const carrierDef = (Object.entries(defPos) as [DefenderId, (typeof defPos)[DefenderId]][])
    .find(([, p]) => p.matchedTo === carrier);
  if (!carrierDef) return out;

  const [dId, p] = carrierDef;
  if (!p.closingOut || !p.closeoutQuality) return out;

  const carrierLabel = withProfile(carrier, profiles?.[carrier]);

  if (p.closeoutQuality === 'late') {
    out.push({
      id: `shooter-closeout-late-${dId}`,
      severity: 'critical',
      message: `${dId} trop loin : ${carrierLabel} a le temps de tirer avant le closeout`,
      tag: 'shooter-closeout-late',
      defenders: [dId],
      attackers: [carrier],
    });
  } else if (p.closeoutQuality === 'desperate') {
    out.push({
      id: `shooter-closeout-desperate-${dId}`,
      severity: 'warning',
      message: `${dId} ferme en urgence sur ${carrierLabel} — contest dégradé`,
      tag: 'shooter-closeout-desperate',
      defenders: [dId],
      attackers: [carrier],
    });
  }

  return out;
};
