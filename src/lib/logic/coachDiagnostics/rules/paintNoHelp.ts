// Règle 6 — Pénétration sans aide.
//
// Porteur dans la raquette (<90px du panier) ET aide globale faible (somme
// des helpFactor < 0.6) → la raquette est ouverte, signal critical.

import type { CoachDiagnostic, Rule } from '../types';
import { distance } from '../../geometry';

export const paintNoHelpRule: Rule = (ctx) => {
  const { carrier, carrierPos, defPos, defenderIds, hoop } = ctx;
  if (!carrierPos) return [];

  const distH = distance(carrierPos, hoop);
  if (distH >= 90) return [];

  const totalHelp = defenderIds.reduce((s, d) => s + (defPos[d]?.helpFactor ?? 0), 0);
  // Aide insuffisante = total < 0.6 (chaque aide forte vaut ~0.4-0.7).
  if (totalHelp >= 0.6) return [];

  const out: CoachDiagnostic[] = [{
    id: 'paint-no-help',
    severity: 'critical',
    message: `Pénétration sans aide — raquette ouverte sur ${carrier}`,
    tag: 'paint-no-help',
    defenders: [],
    attackers: [carrier],
  }];
  return out;
};
