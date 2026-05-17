// Règle B.3 — End-of-quarter contest mode (no fouls).
//
// Émet un diagnostic 'warning' quand la fin de quart approche et que
// l'équipe défensive est déjà en bonus : la stratégie devient "contester
// sans fauter" (pas d'option foul to give). Cas miroir de F.4.

import type { Rule } from '../types';
import { detectEndOfClockContest } from '../../defense/detectEndOfClockContest';

export const endOfClockRule: Rule = (ctx) => {
  const { state, stepIdx } = ctx;
  const sig = detectEndOfClockContest(state, stepIdx);
  if (!sig) return [];

  return [
    {
      id: `end-of-clock-${sig.carrierDefender}-${stepIdx}`,
      severity: 'warning',
      message:
        `Fin de quart : ${sig.clockSeconds.toFixed(1)}s + équipe en bonus (${sig.teamFouls}/5) — ` +
        `${sig.carrierDefender} contest sans fauter, all-hands-up`,
      tag: 'end-of-clock-contest',
      defenders: [sig.carrierDefender],
      attackers: [],
    },
  ];
};
