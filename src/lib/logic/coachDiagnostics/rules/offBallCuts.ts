// Règle 2.d — Cuts hors-ballon.
//
// Différent du baseline-drive (qui cible le porteur) — ici c'est un
// non-porteur qui se déplace vers le panier. Coach friendly : signaler les
// coupes pour que l'utilisateur voie ce que la défense ignore.
//
// Critère : Δ dHoop > 25 entre prev et cur, exclut les screeners. Cf.
// `detectCuts` dans `threatResolution.ts`.

import type { DefenderId } from '../../../types';
import { getMatchupsAt } from '../../engine';
import { activeOffense } from '../../players';
import { detectCuts } from '../../threatResolution';
import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

export const offBallCutsRule: Rule = (ctx) => {
  const { state, stepIdx, off, carrier, defPos, defenderIds, hoop, profiles } = ctx;
  if (stepIdx === 0) return [];

  const prevStep = state.steps[stepIdx - 1];
  if (!prevStep) return [];
  const prevOffMap = activeOffense(prevStep.off, state.playerCount);
  const matchups = getMatchupsAt(state.steps, stepIdx, state.playerCount);

  const defPosForCuts: Record<string, { x: number; y: number }> = {};
  defenderIds.forEach((dId: DefenderId) => {
    defPosForCuts[dId] = { x: defPos[dId].x, y: defPos[dId].y };
  });

  const cuts = detectCuts(off, prevOffMap, carrier, hoop, defPosForCuts, matchups);
  const out: CoachDiagnostic[] = [];

  cuts.forEach((cut) => {
    const cutterLabel = withProfile(cut.cutter, profiles?.[cut.cutter]);
    const sideLabel = cut.side === -1 ? 'G' : cut.side === 1 ? 'D' : '';
    const defenderInSag = cut.cutterDefDistance !== null && cut.cutterDefDistance > 80;
    out.push({
      id: `cut-${cut.cutter}-${stepIdx}`,
      severity: defenderInSag ? 'warning' : 'info',
      message: defenderInSag
        ? `Cut ${sideLabel ? `côté ${sideLabel}` : 'central'} : ${cutterLabel} coupe vers le panier — défenseur en sag (${Math.round(cut.cutterDefDistance!)}px)`
        : `Cut ${sideLabel ? `côté ${sideLabel}` : 'central'} : ${cutterLabel} coupe vers le panier`,
      tag: 'cut-backdoor',
      defenders: [],
      attackers: [cut.cutter],
    });
  });

  return out;
};
