// C.7 V2 — Réaction défensive aux chaînes d'écrans.
//
// Quand `state.readScreenChainsEnabled` est activé ET qu'une chaîne est
// détectée par `detectScreenChain` au step courant, applique une
// modulation locale (positions + flags) sur le(s) défenseur(s) du cutter.
//
// Pas de modification de matchups. Juste des shifts modestes (≤ 8 px) et
// des flags d'orientation/aide. Le tout passe par `resolvePlayerCollisions`
// en aval donc la règle absolue d'anti-superposition reste garantie.
//
// Position dans le pipeline :
//   2   pnrRotations           ← peut écraser (B9 cutterScreenChain notamment)
//   2.5 chainResponse          ← ICI : modulation sur le cutterDef
//   3   offBallScreens
//
// Effet par pattern :
//   - re-screen           : carrierDef shifté ≤ 6 px vers le poseur
//   - stagger-sequential  : no-op (B9 cutterScreenChain a déjà top-locké)
//   - flare-then-fade     : cutterDef gazeLock sur cutter + no-help

import type { AttackerId, DefenderId, Matchups, Point } from '../../types';
import { detectScreenChain } from '../screens';
import { computeDefenderOrientation } from '../orientation';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

const RESCREEN_SHIFT_PX = 6;

export function applyChainResponseLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  if (!ctx.state.readScreenChainsEnabled) return;

  const chain = detectScreenChain(ctx.state, ctx.stepIdx);
  if (!chain) return;

  switch (chain.type) {
    case 're-screen':
      applyReScreenResponse(positions, matchups, chain.cutter, chain.screeners, ctx);
      break;
    case 'stagger-sequential':
      // No-op : B9 `cutterScreenChain` a déjà basculé `top-lock → chase`
      // pour le cutterDef. Préserver pour éviter le double-décalage.
      break;
    case 'flare-then-fade':
      applyFlareThenFadeResponse(positions, matchups, chain.cutter, ctx);
      break;
  }
}

/** Pour re-screen : le carrierDef montre un commitment renforcé.
 *  Position : pas de shift (le carrierDef est typiquement déjà plaqué au
 *  poseur à MIN_CLEARANCE, tout shift vers poseur serait annulé par
 *  resolvePlayerCollisions en aval).
 *  À la place, on BOOST `helpFactor` et `helpKind` pour rendre l'engagement
 *  visible dans le rendu helpLines + diagnostics + on shift TANGENTIELLEMENT
 *  de 4 px (perpendiculaire à carrierDef→screener, côté hoop) pour
 *  représenter "D1 anticipe le roll" sans casser la clearance. */
function applyReScreenResponse(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  cutterCarrier: AttackerId,
  screeners: AttackerId[],
  ctx: DefenseFrameContext
): void {
  const screener = screeners[0];
  if (!screener) return;
  const screenerPos = ctx.off[screener];
  if (!screenerPos) return;

  const cutterDef = findDefender(matchups, cutterCarrier);
  if (!cutterDef) return;
  const target = positions[cutterDef];
  if (!target) return;
  if (target.switchedThisStep || target.scrammedThisStep) return;

  // Shift TANGENTIEL côté hoop : perpendiculaire à (target → screener),
  // dans le sens du panier. Ne traverse pas le poseur (perpendiculaire) →
  // survit au push-out de clearance.
  const dx = screenerPos.x - target.x;
  const dy = screenerPos.y - target.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len; // normale vers le poseur
  const ny = dy / len;
  // Perpendiculaire (rotation 90°) : (perpX, perpY) = (-ny, nx) ou (ny, -nx)
  // On choisit le côté qui pointe VERS le panier (produit scalaire avec
  // direction target→hoop).
  const hoop = ctx.hoop;
  const toHoopX = hoop.x - target.x;
  const toHoopY = hoop.y - target.y;
  const perpX1 = -ny;
  const perpY1 = nx;
  const dotHoop = perpX1 * toHoopX + perpY1 * toHoopY;
  const perpX = dotHoop >= 0 ? perpX1 : -perpX1;
  const perpY = dotHoop >= 0 ? perpY1 : -perpY1;
  positions[cutterDef].x += perpX * RESCREEN_SHIFT_PX;
  positions[cutterDef].y += perpY * RESCREEN_SHIFT_PX;

  // Boost visuel : aide active intensifiée.
  positions[cutterDef].helpFactor = Math.max(target.helpFactor, 0.5);
  positions[cutterDef].helpTriggered = true;
  positions[cutterDef].helpKind = positions[cutterDef].helpKind ?? 'active-help';
}

/** Pour flare-then-fade : le cutterDef force gazeLock sur le cutter (= shooter
 *  qui sort dans le coin) ET helpTriggered = false (pas d'aide pour rester
 *  collé au shooter). Aucune modification de position : juste les flags
 *  d'orientation/aide. */
function applyFlareThenFadeResponse(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  cutter: AttackerId,
  ctx: DefenseFrameContext
): void {
  const cutterDef = findDefender(matchups, cutter);
  if (!cutterDef) return;
  const target = positions[cutterDef];
  if (!target) return;
  if (target.switchedThisStep || target.scrammedThisStep) return;
  if (target.onScreen) return; // déjà dans un contact d'écran : ne pas perturber

  const cutterPos = ctx.off[cutter];
  if (!cutterPos) return;

  // Recalcul orientation avec gazeLock forcé sur le cutter.
  // computeDefenderOrientation gère le clamp anti-anatomie (regard ±90° du corps).
  const rule = ctx.state.rules[cutterDef];
  const oriented = computeDefenderOrientation({
    defenderPos: { x: target.x, y: target.y },
    manPos: cutterPos,
    ballPos: ctx.carrierPos,
    isCarrierDefender: false,
    stance: rule?.offBallStance,
    vsCarrier: rule?.vsCarrier,
    manualDelta: rule?.orientation ?? 0,
    manualBody: rule?.bodyOrientation,
    bodyMode: rule?.bodyOrientationMode,
    gazeLock: 'opponent', // ← force : suivre le shooter qui fade
  });
  positions[cutterDef].orientation = oriented.bodyOrientation;
  positions[cutterDef].gazeOrientation = oriented.gazeOrientation;
  positions[cutterDef].facing = oriented.facing;
  positions[cutterDef].armBallSide = oriented.armBallSide;
  positions[cutterDef].armManSide = oriented.armManSide;
  // Force no-help (cutterDef reste collé au shooter au lieu de partir aider).
  positions[cutterDef].helpTriggered = false;
  positions[cutterDef].helpFactor = 0;
}

/** Trouve le défenseur qui marque `attackerId` dans les matchups. */
function findDefender(matchups: Matchups, attackerId: AttackerId): DefenderId | undefined {
  for (const [dId, oId] of Object.entries(matchups) as Array<[DefenderId, AttackerId]>) {
    if (oId === attackerId) return dId;
  }
  return undefined;
}
