// CVT Chantiers 1.3b + 1.3c — Couche repel autour des poseurs d'écran.
//
// **Conservatrice par design** — ne REMPLACE PAS le push-out binaire
// existant dans `screens/helpers.ts` et `applyScreenAdjustment`. Le
// remplacement complet (`pushOutOfScreener` / `pushOutOfCarrier`) est
// **incompatible avec la Règle 1bis** (`docs/SCREEN-ENGINE.md`) qui
// exige D1 strictement plaqué au poseur à quality 100 (distance ≤
// `MIN_PLAYER_CLEARANCE_PX + 1`). On garde donc le push-out dur en
// fin de chaîne, et on ajoute ici un raffinement périphérique soft.
//
// **Sous-étape 1.3b** : raffine la trajectoire des défenseurs
// périphériques proches du poseur d'un écran **porteur** détecté.
//
// **Sous-étape 1.3c** : étend la couche aux écrans **hors-ballon**
// (détectés via `detectOffBallScreens`) — typiquement les défenseurs
// non-engagés dans la lecture pin-down / flare / stagger / back qui
// passent à proximité d'un poseur reçoivent eux aussi le glide soft.
//
// Filtres conservateurs (skip) :
// - `screen.carrierDef` / `screen.screenerDef` (écran porteur).
// - `obs.screenerDef` / `obs.cutterDef` (écran off-ball) — gérés par
//   `applyOffBallScreenLayer`.
// - `pos.pnrRole` (rotation PnR — `applyPnRRotationsLayer` a déjà
//   placé le défenseur dans une zone "intentionnellement proche" du
//   poseur, ex: low-man tag du roller).
//
// Cap dur `SCREEN_REPEL_LAYER_MAX_SHIFT_PX = 3 px` — sous le bruit
// visuel. Opt-in via `state.useSteeringEngine`.

import type { DefenderId, Matchups, Point } from '../../types';
import { screenerRepelForce } from '../screens/repelForces';
import { detectOffBallScreens } from '../screens';
import { accumulateForces } from '../steeringEngine';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

/** Cap dur du shift produit par cette couche (px). Très conservateur. */
export const SCREEN_REPEL_LAYER_MAX_SHIFT_PX = 3;

/** Liste les poseurs d'écran (porteur + off-ball) à éviter, avec
 *  les défenseurs directement engagés à exclure (carrierDef /
 *  screenerDef / cutterDef). */
function collectScreenerObstacles(
  ctx: DefenseFrameContext,
  matchups: Matchups,
): { screenerPos: Point; engaged: Set<DefenderId> }[] {
  const { state, off, ballCarrier, prevDefenderPositions, prevOff, screen } = ctx;
  const obstacles: { screenerPos: Point; engaged: Set<DefenderId> }[] = [];

  // Écran porteur
  if (screen) {
    const sPos = off[screen.screener];
    if (sPos) {
      obstacles.push({
        screenerPos: sPos,
        engaged: new Set<DefenderId>([screen.carrierDef, screen.screenerDef]),
      });
    }
  }

  // Écrans off-ball (CVT 1.3c)
  const offBallScreens = detectOffBallScreens(
    off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, prevOff ?? undefined,
  );
  for (const obs of offBallScreens) {
    const engaged = new Set<DefenderId>([obs.screenerDef, obs.cutterDef]);
    if (obs.secondScreenerDef) engaged.add(obs.secondScreenerDef);
    obstacles.push({ screenerPos: obs.screenerPos, engaged });
    if (obs.secondScreenerPos) {
      obstacles.push({ screenerPos: obs.secondScreenerPos, engaged });
    }
  }

  return obstacles;
}

export function applyScreenRepelLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext,
): void {
  const { state, defenderIds } = ctx;
  if (!state.useSteeringEngine) return;

  const obstacles = collectScreenerObstacles(ctx, matchups);
  if (obstacles.length === 0) return;

  defenderIds.forEach((dId) => {
    const pos = positions[dId];
    if (!pos) return;
    // Skip les défenseurs en rôle PnR : applyPnRRotationsLayer les
    // place intentionnellement proches du poseur (tag du roller, etc.).
    if (pos.pnrRole) return;

    // Accumuler les forces repel de tous les screeners pertinents
    // (skip ceux où ce défenseur est directement engagé).
    let shiftX = 0;
    let shiftY = 0;
    for (const { screenerPos, engaged } of obstacles) {
      if (engaged.has(dId)) continue;
      const f = screenerRepelForce({ x: pos.x, y: pos.y }, screenerPos);
      if (f.weight <= 0) continue;
      const accum = accumulateForces([f]);
      shiftX += accum.x;
      shiftY += accum.y;
    }
    const mag = Math.hypot(shiftX, shiftY);
    if (mag < 1e-3) return;

    // Cap dur du shift cumulé à SCREEN_REPEL_LAYER_MAX_SHIFT_PX.
    const shift = Math.min(mag, SCREEN_REPEL_LAYER_MAX_SHIFT_PX);
    pos.x += (shiftX / mag) * shift;
    pos.y += (shiftY / mag) * shift;
  });
}
