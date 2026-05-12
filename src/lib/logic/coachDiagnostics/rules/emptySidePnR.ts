// Règle B5 — Empty side PnR (côté faible vide).
//
// Quand le porteur engage un écran sur un côté où il n'y a aucun autre
// attaquant, certaines couvertures sont contre-productives. Le coach doit
// le savoir pour adapter sa consigne.
//
//  - **ice** est dangereux : pousser baseline = donner un drive 1c0 (pas
//    de skip pass à craindre, mais aussi pas de help côté ballon).
//  - **under** est confortable : pas de tireur à libérer derrière l'écran.
//  - **switch** sans coordination = mismatch garanti (le big arrive seul).
//
// V1 : diagnostic-only. On émet une recommandation selon la couverture
// CHOISIE par le coach (screenRule effective sur l'écran courant).

import { detectStepScreenAction } from '../../engine';
import { isEmptySidePnR } from '../../screens';
import type { CoachDiagnostic, Rule } from '../types';
import { withProfile } from '../helpers';

export const emptySidePnRRule: Rule = (ctx) => {
  const { state, stepIdx, off, hoop, profiles } = ctx;
  const detected = detectStepScreenAction(state, stepIdx);
  if (!detected) return [];

  if (!isEmptySidePnR(detected.screen, off, hoop)) return [];

  const { screen } = detected;
  const carrierLabel = withProfile(screen.carrier, profiles?.[screen.carrier]);
  const screenerLabel = withProfile(screen.screener, profiles?.[screen.screener]);

  // Couverture effective sur cet écran.
  const carrierDefRule = state.rules[screen.carrierDef];
  const coverage =
    carrierDefRule?.screenNav && carrierDefRule.screenNav !== 'auto'
      ? carrierDefRule.screenNav
      : state.screenRule;

  const out: CoachDiagnostic[] = [];

  // Diagnostic toujours présent (info de contexte).
  out.push({
    id: `empty-side-pnr-${stepIdx}`,
    severity: 'info',
    message: `Empty side PnR : ${carrierLabel} / ${screenerLabel} côté vide — pas d'attaquant côté ballon`,
    tag: 'empty-side-pnr',
    defenders: [screen.carrierDef, screen.screenerDef],
    attackers: [screen.carrier, screen.screener],
  });

  // Recommandation contre-indiquée selon coverage.
  if (coverage === 'ice') {
    out.push({
      id: `empty-side-ice-warning-${stepIdx}`,
      severity: 'critical',
      message: `Ice sur empty side : pas de baseline à fermer → drive 1c0 garanti pour ${carrierLabel}. Préférer under ou hedge.`,
      tag: 'empty-side-ice-bad',
      defenders: [screen.carrierDef],
      attackers: [screen.carrier],
    });
  } else if (coverage === 'under' || coverage === 'weak') {
    out.push({
      id: `empty-side-under-ok-${stepIdx}`,
      severity: 'good',
      message: `Under sur empty side : choix logique — pas de skip pass à défendre.`,
      tag: 'empty-side-under-ok',
      defenders: [screen.carrierDef],
      attackers: [screen.carrier],
    });
  }

  return out;
};
