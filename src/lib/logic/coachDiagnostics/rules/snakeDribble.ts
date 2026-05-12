// Règle B4 — Snake dribble.
//
// Détecte le pattern offensif où le porteur engage l'écran, recule, puis
// re-attaque le MÊME écran. La défense, ayant "lâché" entre les deux
// engagements, doit re-fermer une 2ᵉ fois — fenêtre tactique forte pour
// l'offense.
//
// V1 : diagnostic-only. À terme : la défense devrait maintenir la
// couverture engagée pendant la retraite (au lieu de re-armer à zéro).

import type { CoachDiagnostic, Rule } from '../types';
import { detectSnakeDribble } from '../../screens';
import { getMatchupsAt } from '../../engine';
import { activeOffense } from '../../players';
import { withProfile } from '../helpers';

export const snakeDribbleRule: Rule = (ctx) => {
  const { state, stepIdx, off, carrier, profiles } = ctx;

  // Snake nécessite 3 steps de fenêtre : N-2, N-1, N.
  if (stepIdx < 2) return [];

  const prevStep = state.steps[stepIdx - 1];
  const prevPrevStep = state.steps[stepIdx - 2];
  if (!prevStep || !prevPrevStep) return [];

  const prevOff = activeOffense(prevStep.off, state.playerCount);
  const prevPrevOff = activeOffense(prevPrevStep.off, state.playerCount);
  const matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);

  const snake = detectSnakeDribble(
    off,
    prevOff,
    prevPrevOff,
    carrier,
    matchups,
    state.screenRadius
  );

  if (!snake) return [];

  const carrierLabel = withProfile(snake.carrier, profiles?.[snake.carrier]);
  const screenerLabel = withProfile(snake.screener, profiles?.[snake.screener]);

  // Sévérité : 'warning' si V très prononcé (peak > 1.5 × entry), sinon 'info'.
  const sharp = snake.distAtPeak > snake.distAtEntry * 1.5;

  return [
    {
      id: `snake-${snake.carrier}-${snake.screener}-${stepIdx}`,
      severity: sharp ? 'warning' : 'info',
      message: sharp
        ? `Snake dribble : ${carrierLabel} re-utilise l'écran de ${screenerLabel} après retraite — défense doit recover 2 fois`
        : `Snake : ${carrierLabel} recule puis revient sur ${screenerLabel} (V ${Math.round(snake.distAtEntry)} → ${Math.round(snake.distAtPeak)} → ${Math.round(snake.distAtReturn)}px)`,
      tag: 'snake-dribble',
      defenders: [snake.carrierDef, snake.screenerDef],
      attackers: [snake.carrier, snake.screener],
    },
  ];
};
