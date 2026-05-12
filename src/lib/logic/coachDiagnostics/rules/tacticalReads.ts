// Règle 7 — Lectures tactiques offensives (P5).
//
// Délègue à `computeTacticalReads` qui détecte les opportunités à exploiter
// selon la couverture détectée. Les diagnostics sortis sont préfixés "→"
// avec tag "read-*" pour distinction visuelle.
//
// Cette règle est triviale — elle ne fait que ré-emballer la sortie pour
// uniformité du registry.

import { computeTacticalReads } from '../../tacticalReads';
import type { Rule } from '../types';

export const tacticalReadsRule: Rule = (ctx) => {
  return computeTacticalReads(ctx.state, ctx.stepIdx, ctx.defPos);
};
