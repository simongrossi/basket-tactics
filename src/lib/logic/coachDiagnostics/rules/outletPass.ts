// A11 V2 — Règle outlet pass.
//
// Sur un step marqué `outletPassPending: true` (= rebond défensif),
// suggère au coach d'ajouter une passe outlet pour enclencher la
// transition adverse. Diagnostic 'info' purement indicatif (pas
// d'action automatique).

import type { Rule } from '../types';

export const outletPassRule: Rule = (ctx) => {
  const { state, stepIdx } = ctx;
  const cur = state.steps[stepIdx];
  if (!cur || !cur.outletPassPending) return [];

  const rebounder = cur.rebounder ?? '?';
  return [
    {
      id: `outlet-pass-${stepIdx}`,
      severity: 'info',
      message:
        `Rebond défensif ${rebounder} : possession bascule. ` +
        `Ajouter une passe outlet vers un guard pour enclencher la transition.`,
      tag: 'outlet-pass-pending',
      defenders: typeof cur.rebounder === 'string' && cur.rebounder.startsWith('D')
        ? [cur.rebounder as 'D1' | 'D2' | 'D3' | 'D4' | 'D5']
        : [],
      attackers: [],
    },
  ];
};
