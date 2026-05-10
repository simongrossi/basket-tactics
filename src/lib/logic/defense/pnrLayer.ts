// Couche 2 — Rotations PnR : low-man tag + X-out + nail stunt.
//
// S'applique seulement si un écran porteur est détecté ET que l'action
// implique un mouvement vers le panier (roll / short-roll / slip). Pas
// appliquée en cas de switch (matchups déjà inversés, défense déjà
// recalibrée). Pas appliquée si défenseur a un override manuel — celui-ci
// gagne dans `effectiveDefensePositions`.

import type { DefenderId, Matchups, Point } from '../../types';
import { activeDefenseInitial, activeOffense } from '../players';
import { detectScreenAction } from '../screenAction';
import { computePnRRotations } from '../pnrRotations';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyPnRRotationsLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { state, stepIdx, off, hoop, screen, effectiveScreenRule, defenderIds } = ctx;
  if (!screen || effectiveScreenRule === 'switch') return;

  const prevOff = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : null;
  const prevPrevOff = stepIdx > 1 ? activeOffense(state.steps[stepIdx - 2].off, state.playerCount) : null;
  const action = detectScreenAction(off, prevOff, screen, null, prevPrevOff, hoop);
  const currentTargets = {} as Record<DefenderId, Point>;
  defenderIds.forEach((dId) => {
    currentTargets[dId] = { x: positions[dId].x, y: positions[dId].y };
  });
  const overrides = computePnRRotations(
    off, matchups, screen, action, currentTargets, hoop,
    activeDefenseInitial(state.defenseInitial, state.playerCount)
  );
  for (const ov of overrides) {
    positions[ov.defender].x = Math.round(ov.target.x);
    positions[ov.defender].y = Math.round(ov.target.y);
    positions[ov.defender].pnrRole = ov.role;
    // Marque comme aide active pour que HelpLines distingue ces rotations.
    if (ov.role === 'tag' || ov.role === 'x-out') {
      positions[ov.defender].helpFactor = Math.max(positions[ov.defender].helpFactor, 0.6);
      positions[ov.defender].helpTriggered = true;
    }
    // Pour le debug : aim de la rotation = la cible elle-même (le défenseur
    // se dirige vers ce point). On écrase l'éventuel aim d'aide standard
    // car la rotation PnR prend le pas.
    positions[ov.defender].helpAim = ov.target;
    positions[ov.defender].helpKind = 'active-help';
  }
}
