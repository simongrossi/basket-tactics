// Couche 2 — Rotations PnR : low-man tag + X-out + nail stunt.
//
// S'applique seulement si un écran porteur est détecté ET que l'action
// implique un mouvement vers le panier (roll / short-roll / slip). Pas
// appliquée en cas de switch (matchups déjà inversés, défense déjà
// recalibrée). Pas appliquée si défenseur a un override manuel — celui-ci
// gagne dans `effectiveDefensePositions`.

import type { AttackerId, DefenderId, Matchups, Point } from '../../types';
import { activeDefenseInitial, activeOffense } from '../players';
import { detectScreenAction } from '../screenAction';
import { computePnRRotations } from '../pnrRotations';
import { distance } from '../geometry';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import { PNR_TAG_THEN_SWITCH_DIST_PX as TAG_THEN_SWITCH_DIST_PX } from './constants';

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

  // C.5 — Tag-then-switch dynamic.
  // Si state.tagThenSwitchEnabled ET un override 'tag' a été appliqué ET
  // le roller (= screener) est très proche du panier (≤ 150px), on bascule
  // en switch implicite :
  //  - matchups[lowMan]    = screener   (le low man PREND le roller)
  //  - matchups[screenerDef] = orphan   (le défenseur du screener prend l'orphelin)
  //  - Position lowMan ajustée homme-à-homme sur screener (au-dessus du tag)
  //  - Position screenerDef ajustée homme-à-homme sur l'orphelin
  // Évite le scénario "low man tag trop tard puis recover sur orphelin
  // pendant que roller marque" qui est typique du drop coverage mal géré.
  if (state.tagThenSwitchEnabled && screen) {
    const tagOverride = overrides.find((o) => o.role === 'tag');
    if (tagOverride) {
      const lowManId = tagOverride.defender;
      const rollerPos = off[screen.screener];
      if (rollerPos && distance(rollerPos, hoop) <= TAG_THEN_SWITCH_DIST_PX) {
        const orphan: AttackerId = matchups[lowManId];
        const orphanPos = off[orphan];
        // Swap matchups : lowMan ↔ screenerDef.
        matchups[lowManId] = screen.screener;
        matchups[screen.screenerDef] = orphan;
        positions[lowManId].matchedTo = screen.screener;
        positions[screen.screenerDef].matchedTo = orphan;
        // Position lowMan : homme-à-homme sur le roller (entre roller et panier).
        const nLM_x = (hoop.x - rollerPos.x);
        const nLM_y = (hoop.y - rollerPos.y);
        const nLMlen = Math.hypot(nLM_x, nLM_y) || 1;
        positions[lowManId].x = Math.round(rollerPos.x + (nLM_x / nLMlen) * 30);
        positions[lowManId].y = Math.round(rollerPos.y + (nLM_y / nLMlen) * 30);
        positions[lowManId].pnrRole = undefined; // plus en tag, en marquage direct
        // Position screenerDef : homme-à-homme sur l'orphelin.
        if (orphanPos) {
          const nSD_x = (hoop.x - orphanPos.x);
          const nSD_y = (hoop.y - orphanPos.y);
          const nSDlen = Math.hypot(nSD_x, nSD_y) || 1;
          positions[screen.screenerDef].x = Math.round(orphanPos.x + (nSD_x / nSDlen) * 30);
          positions[screen.screenerDef].y = Math.round(orphanPos.y + (nSD_y / nSDlen) * 30);
        }
        // Marque ce step comme switché pour les diagnostics.
        positions[lowManId].switchedThisStep = true;
        positions[screen.screenerDef].switchedThisStep = true;
      }
    }
  }
}
