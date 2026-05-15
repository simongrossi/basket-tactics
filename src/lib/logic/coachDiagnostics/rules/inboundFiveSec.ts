// Règle coach — remise en jeu : règle des 5 secondes FIBA / NBA.
//
// Émet :
//  - INFO systématique sur tout step `inbound-*` (rappel pédagogique
//    "Remise en jeu, 5s à respecter").
//  - WARNING si l'étape SUIVANTE n'a pas de passe partant du
//    `ballCarrier` (inbounder). Sans cette passe, le scénario produit
//    une violation 5s en mode live → le coach doit la corriger.
//  - CRITICAL si on est sur la dernière étape ET inbound-* (la remise
//    n'aboutit pas du tout, scénario incomplet).

import type { Rule } from '../types';

export const inboundFiveSecRule: Rule = (ctx) => {
  const { cur, state, stepIdx } = ctx;
  const isInbound =
    cur.context === 'inbound-baseline' ||
    cur.context === 'inbound-sideline-low' ||
    cur.context === 'inbound-sideline-high';
  if (!isInbound) return [];

  const ctxLabel =
    cur.context === 'inbound-baseline'
      ? 'BLOB (ligne de fond)'
      : cur.context === 'inbound-sideline-low'
        ? 'SLOB bas (touche offensive)'
        : 'SLOB haut (transition)';

  const inbounder = cur.ballCarrier;
  const nextStep = state.steps[stepIdx + 1];

  // Cas 1 : pas d'étape suivante → critical (scénario incomplet)
  if (!nextStep) {
    return [
      {
        id: `inbound-incomplete-${stepIdx}`,
        severity: 'critical',
        message: `${ctxLabel} : aucune étape suivante. Ajouter la passe rentrante de ${inbounder} (sinon violation 5s).`,
        tag: 'inbound-incomplete',
        defenders: [],
        attackers: [inbounder],
      },
    ];
  }

  // Cas 2 : étape suivante existe mais pas de passe partant de l'inbounder
  const hasPassFromInbounder = nextStep.annotations.some(
    (a) => a.type === 'pass' && a.fromId === inbounder
  );
  if (!hasPassFromInbounder) {
    return [
      {
        id: `inbound-no-pass-${stepIdx}`,
        severity: 'warning',
        message: `${ctxLabel} : pas de passe rentrante détectée. ${inbounder} doit donner la balle dans la prochaine étape (violation 5s sinon).`,
        tag: 'inbound-no-pass',
        defenders: [],
        attackers: [inbounder],
      },
    ];
  }

  // Cas 3 : tout va bien, info pédagogique
  return [
    {
      id: `inbound-ok-${stepIdx}`,
      severity: 'info',
      message: `${ctxLabel} · passeur ${inbounder} · 5s pour la rentrée de balle.`,
      tag: 'inbound-5s-info',
      defenders: [],
      attackers: [inbounder],
    },
  ];
};
