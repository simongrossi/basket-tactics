// Règle 2 — Mismatch après switch.
//
// Tout défenseur dont le flag `switchedThisStep` est à true a échangé son
// homme à cette étape. On le signale pour que le coach considère l'asymétrie
// physique (grand sur petit ou inversement).

import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

export const switchMismatchRule: Rule = (ctx) => {
  const { defPos, defenderIds, profiles } = ctx;
  const out: CoachDiagnostic[] = [];

  defenderIds.forEach((dId) => {
    const p = defPos[dId];
    if (!p?.switchedThisStep) return;
    out.push({
      id: `switch-mismatch-${dId}`,
      severity: 'warning',
      message: `Switch : ${dId} sur ${withProfile(p.matchedTo, profiles?.[p.matchedTo])} — mismatch potentiel à attaquer`,
      tag: 'switch-mismatch',
      defenders: [dId],
      attackers: [p.matchedTo],
    });
  });

  return out;
};
