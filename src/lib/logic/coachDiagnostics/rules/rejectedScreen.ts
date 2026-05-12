// Règle B2 — Reject screen (porteur refuse l'écran anticipé par la défense).
//
// Détecte le pattern : à N-1, un poseur potentiel + couverture anticipée par
// la défense (over / hedge / blitz typiquement). À N, le porteur vire dans
// la direction opposée. Verdict basket : la défense est sur-anticipée, le
// porteur a un avantage côté opposé.
//
// V1 : diagnostic-only. Pas de modification de la couverture défensive.

import type { CoachDiagnostic, Rule } from '../types';
import { detectRejectedScreen } from '../../screens';
import { effectiveDefensePositions, getMatchupsAt } from '../../engine';
import { activeOffense } from '../../players';
import { extractDefenderPositions } from '../../engine';
import { withProfile } from '../helpers';

export const rejectedScreenRule: Rule = (ctx) => {
  const { state, stepIdx, off, carrier, profiles } = ctx;

  // Pas d'historique avant step 1 → pas de detection possible.
  if (stepIdx < 1) return [];

  const prevStep = state.steps[stepIdx - 1];
  if (!prevStep) return [];

  const prevOff = activeOffense(prevStep.off, state.playerCount);

  // Matchups en début du step courant (= post-switch du step précédent).
  const matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);

  // Positions défensives à la FIN du step précédent (= début du step courant).
  const prevDefPositions = extractDefenderPositions(
    effectiveDefensePositions(state, stepIdx - 1)
  );

  const reject = detectRejectedScreen(
    off,
    prevOff,
    carrier,
    matchups,
    prevDefPositions,
    state.screenRadius
  );

  if (!reject) return [];

  const out: CoachDiagnostic[] = [];
  const carrierLabel = withProfile(reject.carrier, profiles?.[reject.carrier]);
  const screenerLabel = withProfile(reject.screener, profiles?.[reject.screener]);

  // Awareness "nette" si dot ≤ -0.7 (mouvement franchement opposé).
  const sharp = reject.awayness <= -0.7;

  out.push({
    id: `reject-${reject.carrier}-${reject.screener}-${stepIdx}`,
    severity: sharp ? 'warning' : 'info',
    message: sharp
      ? `Reject écran : ${carrierLabel} refuse ${screenerLabel} et vire opposé — défense sur-anticipée (${reject.carrierDef}/${reject.screenerDef})`
      : `Reject possible : ${carrierLabel} s'écarte de ${screenerLabel} sans contact (${Math.round(reject.curDistance)}px vs ${Math.round(reject.prevDistance)}px)`,
    tag: 'reject-screen',
    defenders: [reject.carrierDef, reject.screenerDef],
    attackers: [reject.carrier, reject.screener],
  });

  return out;
};
