// Règle 2 — Mismatch après switch + scram switch (B1).
//
// Trois sous-cas :
//
//  1. Scram switch appliqué (`scrammedThisStep`) → diagnostic 'good' explicatif :
//     "Scram switch : D3 prend O5, D5 reprend O3" — la défense a corrigé.
//
//  2. Mismatch SÉVÈRE (severity ≥ 3) post-switch sans scram → 'critical' :
//     "D5 sur O1 — mismatch extrême, attaquer immédiatement".
//
//  3. Mismatch standard (severity ≥ threshold) → 'warning' (cas legacy).
//
// Le seuil `threshold` vient de `state.mismatchThreshold` (default 2) — mais
// au niveau du diagnostic on l'inline plutôt que de le faire descendre pour
// rester compatible avec les tests existants. Severity vient de
// `ComputedDefender.mismatchSeverity` propagé depuis baseTargets.

import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

export const switchMismatchRule: Rule = (ctx) => {
  const { defPos, defenderIds, profiles, state } = ctx;
  const threshold = state.mismatchThreshold ?? 2;
  const out: CoachDiagnostic[] = [];

  // Pass 1 : scram switch ⇒ feedback positif unique pour la paire scram (from+to).
  // On émet UN diagnostic global plutôt qu'un par défenseur pour éviter le doublon.
  const scrammers = defenderIds.filter((d) => defPos[d]?.scrammedThisStep);
  if (scrammers.length === 2) {
    const [a, b] = scrammers;
    const aLabel = withProfile(defPos[a].matchedTo, profiles?.[defPos[a].matchedTo]);
    const bLabel = withProfile(defPos[b].matchedTo, profiles?.[defPos[b].matchedTo]);
    out.push({
      id: 'scram-switch',
      severity: 'good',
      message: `Scram switch : ${a} prend ${aLabel}, ${b} reprend ${bLabel} — mismatch corrigé`,
      tag: 'scram-switch',
      defenders: scrammers,
      attackers: [defPos[a].matchedTo, defPos[b].matchedTo],
    });
  }

  // Pass 2 : pour chaque défenseur ayant switché à ce step, on émet le bon
  // niveau d'alerte selon la severity. Les scrammés ont déjà leur diag
  // positif au-dessus → on les skip ici pour ne pas brouiller le message.
  defenderIds.forEach((dId) => {
    const p = defPos[dId];
    if (!p?.switchedThisStep) return;
    if (p.scrammedThisStep) return; // déjà couvert par le diag 'good' ci-dessus

    const severity = p.mismatchSeverity ?? 0;
    const attLabel = withProfile(p.matchedTo, profiles?.[p.matchedTo]);

    if (severity >= 3) {
      out.push({
        id: `switch-mismatch-severe-${dId}`,
        severity: 'critical',
        message: `Switch : ${dId} sur ${attLabel} — mismatch extrême (severity ${severity}), à attaquer immédiatement`,
        tag: 'switch-mismatch-severe',
        defenders: [dId],
        attackers: [p.matchedTo],
      });
    } else if (severity >= threshold) {
      out.push({
        id: `switch-mismatch-${dId}`,
        severity: 'warning',
        message: `Switch : ${dId} sur ${attLabel} — mismatch (severity ${severity}) à exploiter`,
        tag: 'switch-mismatch',
        defenders: [dId],
        attackers: [p.matchedTo],
      });
    } else {
      // Severity < threshold : juste un info léger (matchup neutre).
      out.push({
        id: `switch-${dId}`,
        severity: 'info',
        message: `Switch : ${dId} sur ${attLabel}`,
        tag: 'switch',
        defenders: [dId],
        attackers: [p.matchedTo],
      });
    }
  });

  return out;
};
