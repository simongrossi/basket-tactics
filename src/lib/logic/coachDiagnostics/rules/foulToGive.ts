// Règle F.4 — End-of-quarter foul to give.
//
// Émet un diagnostic 'critical' quand la fin de quart approche, la défense
// peut encore prendre une faute sans donner de lancers, et le porteur
// attaque le panier. Le défenseur du porteur est la cible naturelle.

import type { Rule } from '../types';
import { detectFoulToGiveOpportunity } from '../../defense/detectFoulToGiveOpportunity';
import { withProfile } from '../helpers';

export const foulToGiveRule: Rule = (ctx) => {
  const { state, stepIdx, profiles } = ctx;
  const opp = detectFoulToGiveOpportunity(state, stepIdx);
  if (!opp) return [];

  const carrierLabel = withProfile(opp.carrier, profiles?.[opp.carrier]);
  return [
    {
      id: `foul-to-give-${opp.carrierDefender}-${stepIdx}`,
      severity: 'critical',
      message:
        `Foul to give : ${opp.clockSeconds.toFixed(1)}s au quart, équipe ${opp.teamFouls}/5 fautes — ` +
        `${opp.carrierDefender} peut couper l'action sur ${carrierLabel}`,
      tag: 'foul-to-give',
      defenders: [opp.carrierDefender],
      attackers: [opp.carrier],
    },
  ];
};
