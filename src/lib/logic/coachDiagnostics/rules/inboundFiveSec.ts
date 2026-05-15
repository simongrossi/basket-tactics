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

  // P3.2 — scan toutes les étapes suivantes pour trouver la passe de
  // l'inbounder. Calcule passStepOffset pour le compteur 5s statique.
  let passStepOffset = 0;
  for (let i = stepIdx + 1; i < state.steps.length; i += 1) {
    const s = state.steps[i];
    const hasPass = s.annotations.some(
      (a) => a.type === 'pass' && a.fromId === inbounder
    );
    if (hasPass) {
      passStepOffset = i - stepIdx;
      break;
    }
  }

  // Cas 2 : aucune passe de l'inbounder dans toute la timeline ultérieure
  if (passStepOffset === 0) {
    return [
      {
        id: `inbound-no-pass-${stepIdx}`,
        severity: 'warning',
        message: `${ctxLabel} : pas de passe rentrante détectée. ${inbounder} doit donner la balle dans une étape suivante (violation 5s sinon).`,
        tag: 'inbound-no-pass',
        defenders: [],
        attackers: [inbounder],
      },
    ];
  }

  // P3.2 — compteur 5s statique : durée estimée basée sur secondsPerStep.
  const secondsPerStep = state.secondsPerStep ?? 4;
  // Note : passStepOffset = 1 = passe au step suivant (cas standard).
  // passStepOffset >= 2 = pré-screen / mouvement avant la passe.
  const estimatedDuration = passStepOffset * secondsPerStep;
  if (estimatedDuration > 5) {
    return [
      {
        id: `inbound-5s-overflow-${stepIdx}`,
        severity: 'critical',
        message: `${ctxLabel} : durée estimée ${estimatedDuration.toFixed(1)}s avant la passe rentrante (${passStepOffset} steps × ${secondsPerStep}s/step). VIOLATION 5s en live.`,
        tag: 'inbound-5s-overflow',
        defenders: [],
        attackers: [inbounder],
      },
    ];
  }

  // Cas 3 : tout va bien, info pédagogique avec durée estimée
  return [
    {
      id: `inbound-ok-${stepIdx}`,
      severity: 'info',
      message: `${ctxLabel} · passeur ${inbounder} · durée estimée ${estimatedDuration.toFixed(1)}s / 5s max.`,
      tag: 'inbound-5s-info',
      defenders: [],
      attackers: [inbounder],
    },
  ];
};
