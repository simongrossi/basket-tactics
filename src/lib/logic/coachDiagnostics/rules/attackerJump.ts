// Règle 2.b — Saut irréaliste d'attaquant entre étapes.
//
// Un humain ne franchit pas 4m en une keyframe. Si la distance entre l'étape
// précédente et l'étape courante dépasse 4m × PX_PER_M (≈ 148 px), on pose
// un warning sans bloquer la simulation — l'utilisateur est averti que la
// keyframe est suspecte (probable erreur de drag).
//
// Requiert un step précédent : pas de diag à stepIdx === 0.

import type { AttackerId } from '../../../types';
import { PX_PER_M } from '../../../data/court';
import { distance } from '../../geometry';
import { activeOffense } from '../../players';
import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

const TELEPORT_PX_THRESHOLD = 4 * PX_PER_M; // ≈ 148 px

export const attackerJumpRule: Rule = (ctx) => {
  const { state, stepIdx, off, profiles } = ctx;
  if (stepIdx === 0) return [];

  const prev = state.steps[stepIdx - 1];
  if (!prev) return [];
  const prevOff = activeOffense(prev.off, state.playerCount);
  const out: CoachDiagnostic[] = [];

  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const prevP = prevOff[id];
    const curP = off[id];
    if (!prevP || !curP) return;
    const d = distance(prevP, curP);
    if (d <= TELEPORT_PX_THRESHOLD) return;
    const meters = (d / PX_PER_M).toFixed(1);
    out.push({
      id: `attacker-jump-${id}-${stepIdx}`,
      severity: 'warning',
      message: `Saut irréaliste de ${withProfile(id, profiles?.[id])} (${meters}m sur l'étape) — vérifie la keyframe`,
      tag: 'attacker-jump',
      defenders: [],
      attackers: [id],
    });
  });

  return out;
};
