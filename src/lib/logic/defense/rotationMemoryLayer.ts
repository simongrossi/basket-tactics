// P4.4 — Couche 2.05 : mémoire de rotation (cf. `rotationMemory.ts`).
//
// Les échanges de duels (rotate-and-stay, retour au calme) sont déjà faits
// dans les matchups par `buildDefenseFrameContext` : la couche de base a donc
// placé le tagueur sur le roller et le défenseur du poseur sur l'homme laissé.
// Ici on :
//  1. pose l'état de rotation sur les cibles (badge coach + diagnostics) ;
//  2. termine progressivement les rotations PnR de l'étape précédente : un
//     défenseur qui était en tag / X-out / stunt et qui n'a plus de rôle
//     revient à mi-chemin (ROTATION_RECOVER_BLEND) au lieu de repartir d'un
//     coup sur son homme.
//
// Position dans le pipeline : juste après `applyPnRRotationsLayer` (couche 2),
// qui reste prioritaire (un écran qui continue relance le tag normalement).
// Les positions passent ensuite par `resolvePlayerCollisions` dans
// `effectiveDefensePositions` : la Règle 1 (34 px) reste garantie.

import type { DefenderId, Matchups } from '../../types';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import { ROTATION_RECOVER_BLEND } from './constants';

export function applyRotationMemoryLayer(
  positions: Record<DefenderId, DefenderTarget>,
  _matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const { state, defenderIds, rotationEvents, prevTargets } = ctx;
  if (!state.rotationMemory) return;

  defenderIds.forEach((dId) => {
    const target = positions[dId];
    if (!target) return;

    const event = rotationEvents[dId];
    if (event) {
      target.rotation = event;
      // Duels échangés (garde le roller, aide l'aideur, cascade)
      // sont en marquage direct : pas de retour progressif à appliquer.
      if (event === 'stay' || event === 'help-the-helper' || event === 'closeout' || event === 'rotate') return;
    }

    const prev = prevTargets?.[dId];
    if (!prev?.pnrRole) return;
    // Rotation encore active à cette étape (écran qui continue) : la couche
    // PnR a déjà placé le défenseur.
    if (target.pnrRole) return;
    if (target.onScreen || target.switchedThisStep || target.scrammedThisStep) return;

    const keep = ROTATION_RECOVER_BLEND;
    target.x = prev.x * keep + target.x * (1 - keep);
    target.y = prev.y * keep + target.y * (1 - keep);
    target.rotation = 'recover';
    target.helpTriggered = true;
    target.helpKind = 'active-help';
    target.helpAim = { x: prev.x, y: prev.y };
    target.helpFactor = Math.max(target.helpFactor, keep * 0.7);
  });
}
