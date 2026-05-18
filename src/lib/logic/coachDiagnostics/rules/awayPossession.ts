// E.1 V2 stage 2b — Règle "phase adverse en cours".
//
// Sur un step marqué `viewSide: 'away'`, émet un diagnostic 'info'
// indiquant au coach que les rôles sont visuellement inversés : les O
// représentent l'équipe adverse, les D représentent nos joueurs home
// jouant en défense. Permet d'éviter la confusion sur les autres
// diagnostics coach qui assument "O = nos attaquants".

import type { Rule } from '../types';

export const awayPossessionRule: Rule = (ctx) => {
  const { state, stepIdx } = ctx;
  const cur = state.steps[stepIdx];
  if (!cur || cur.viewSide !== 'away') return [];

  return [
    {
      id: `away-possession-${stepIdx}`,
      severity: 'info',
      message:
        'Phase adverse — les rôles offensif/défensif sont visuellement ' +
        'inversés. Les O représentent l\'équipe adverse, les D vos joueurs ' +
        'home désormais en défense.',
      tag: 'away-possession',
      defenders: [],
      attackers: [],
    },
  ];
};
