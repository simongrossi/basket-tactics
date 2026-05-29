// Couche 1.5 — Rim protection en défense individuelle.
//
// Après la couche baseTargets, vérifie qu'aucun attaquant proche du panier
// n'a un couloir libre. Si oui, désigne le défenseur le plus proche du
// panier comme rim-protector et bias son target vers le point d'interception
// (mi-chemin entre l'attaquant menaçant et le panier).
//
// Règle basket fondamentale "pas d'easy basket" — même en man-to-man, un
// défenseur abandonne son matchup pour fermer un drive ou cut imminent vers
// le panier si personne n'est en couverture.

import type { DefenderId, Matchups } from '../../types';
import { detectFreePathThreats, type ThreatDefenderInput } from '../threatResolution';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import { RIM_PROTECTION_BIAS_WEIGHT as RIM_BIAS_WEIGHT } from './constants';

export function applyRimProtectionLayer(
  positions: Record<DefenderId, DefenderTarget>,
  _matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { off, ballCarrier, defenderIds, hoop, prevOff } = ctx;

  // Construit le map des positions actuelles des défenseurs (après baseTargets).
  const defPositions: Record<string, ThreatDefenderInput> = {};
  defenderIds.forEach((dId) => {
    const p = positions[dId];
    if (p) defPositions[dId] = { x: p.x, y: p.y };
  });

  // Le défenseur du porteur est exclu : il a déjà sa mission. On ne veut pas
  // qu'il quitte le porteur pour faire de la rim-protection.
  const unavailable = new Set<DefenderId>();
  const carrierDef = defenderIds.find((dId) => positions[dId]?.isCarrierDefender);
  if (carrierDef) unavailable.add(carrierDef);

  const threats = detectFreePathThreats(off, hoop, defPositions, unavailable, prevOff);

  threats.forEach((threat) => {
    if (!threat.designated) return;
    if (threat.attacker === ballCarrier) {
      // Pour le porteur, c'est carrierDef qui s'en occupe normalement.
      // Skip pour ne pas mettre 2 défenseurs sur le porteur.
      return;
    }
    const dId = threat.designated;
    const current = positions[dId];
    if (!current) return;

    // Position d'interception : mi-chemin entre attaquant et panier.
    const intercept = {
      x: (threat.pos.x + hoop.x) / 2,
      y: (threat.pos.y + hoop.y) / 2,
    };
    // Pondère par l'urgence (dHoop proche → pondération forte).
    const w = RIM_BIAS_WEIGHT * threat.urgency;
    positions[dId] = {
      ...current,
      x: Math.round(current.x + (intercept.x - current.x) * w),
      y: Math.round(current.y + (intercept.y - current.y) * w),
      helpTriggered: true,
      helpKind: 'active-help',
    };
  });
}
