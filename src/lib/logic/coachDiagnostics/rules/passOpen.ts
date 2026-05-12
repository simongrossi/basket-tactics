// Règle 5 — Passe ouverte vers menace forte.
//
// Utilise le moteur `threats` : pour chaque attaquant non-porteur avec
// `receivability ≥ 1` (passe non bloquée/contestée) ET `score ≥ 0.42`
// (menace modérée+), on signale la ligne de passe.
//
// Évite les doublons avec les diagnostics `corner-*` (qui sont déjà
// granulaires sur les corners faibles).

import type { AttackerId } from '../../../types';
import { computeAttackerThreats } from '../../threats';
import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

interface ThreatItem {
  attackerId: AttackerId;
  score: number;
  receivability: number;
  isCarrier: boolean;
}

export const passOpenRule: Rule = (ctx) => {
  const { off, defPos, carrier, hoop, profiles } = ctx;
  const threats = computeAttackerThreats(off, defPos, carrier, hoop, profiles);
  const out: CoachDiagnostic[] = [];

  (Object.values(threats) as ThreatItem[]).forEach((t) => {
    if (t.isCarrier) return;
    if (t.receivability < 1) return; // déjà bloquée/contestée
    if (t.score < 0.42) return; // menace modérée seulement

    const targetLabel = withProfile(t.attackerId, profiles?.[t.attackerId]);
    out.push({
      id: `skip-${t.attackerId}`,
      severity: t.score > 0.55 ? 'critical' : 'warning',
      message: `Passe ouverte vers ${targetLabel} (${Math.round(t.score * 100)}%) — fermer la ligne`,
      tag: 'pass-open',
      defenders: [],
      attackers: [t.attackerId],
    });
  });

  return out;
};

/**
 * Le filtre anti-doublon avec `corner-*` n'est pas appliqué dans la règle
 * elle-même : il sort plus propre dans l'orchestrateur principal après
 * récolte de tous les diagnostics. Cf. `index.ts > dedupePassOpenVsCorner`.
 */
