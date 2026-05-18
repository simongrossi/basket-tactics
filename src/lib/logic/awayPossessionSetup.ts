// E.1 V2 stage 2b — Setup d'une phase de possession adverse.
//
// Concept : sur un step en mode "phase adverse", l'équipe nominalement
// défensive (home) JOUE EN DÉFENSE contre l'équipe adverse qui attaque.
// Pour rester compatible avec le moteur existant qui assume "O = attaque,
// D = défense", on inverse géométriquement les positions par mirror
// vertical autour de y=540 (= demi-court). Les "O" du step adverse
// représentent visuellement l'équipe adverse (rendue en rouge dans
// CourtView), les "D" représentent nos joueurs home (en bleu home).
//
// Pattern identique à F.2 buildFreeThrowReboundSetup et A11
// buildShotReboundSetup : module pur, prend un state, retourne un setup.
// Pas de side effects.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  Point,
} from '../types';
import { effectiveDefensePositions } from './engine';
import { activeOffense, getActiveDefenderIds, getActiveAttackerIds } from './players';

/** Constante de mirror : milieu vertical du demi-court (y=540 dans le
 *  système de coordonnées du moteur). Identique à la game loop qui
 *  utilise la même constante pour positionner awayPlayerPositions. */
export const HALF_COURT_Y = 540;

export interface AwayPossessionSetup {
  /** Positions attaquants du step adverse. Mirror vertical des
   *  positions sourceStep.defPos (= ce qui était nos défenseurs
   *  devient les nouveaux "attaquants" représentant l'équipe adverse). */
  off: AttackerPositions;
  /** Positions défenseurs du step adverse. Mirror vertical des
   *  positions sourceStep.off (= ce qui était nos attaquants home
   *  devient les "défenseurs" du moteur, représentant nos joueurs
   *  home désormais en défense). */
  def: DefenderPositions;
  /** Porteur du step adverse. Par défaut le premier attaquant
   *  miroir-mappé depuis le rebondeur défensif source. */
  ballCarrier: AttackerId;
}

/** Mirror vertical d'un point autour de HALF_COURT_Y. */
function mirrorY(p: Point): Point {
  return { x: p.x, y: 2 * HALF_COURT_Y - p.y };
}

/**
 * Construit le setup d'un step "possession adverse" à partir du step
 * source.
 *
 * Logique de mapping :
 *   - Les défenseurs sourceStep deviennent les ATTAQUANTS du step
 *     adverse (positions miroir verticale).
 *   - Les attaquants sourceStep deviennent les DÉFENSEURS du step
 *     adverse (positions miroir verticale).
 *   - Le porteur initial est le premier attaquant (correspondant au
 *     rebondeur défensif source si applicable).
 *
 * Cas typique d'usage : sourceStep a `outletPassPending: true` (= rebond
 * défensif). On bascule en phase adverse pour montrer la transition.
 */
export function buildAwayPossessionSetup(
  state: AppState,
  sourceStepIdx: number,
): AwayPossessionSetup {
  const sourceStep = state.steps[sourceStepIdx];
  if (!sourceStep) {
    throw new Error(`buildAwayPossessionSetup: sourceStepIdx ${sourceStepIdx} invalide`);
  }

  const sourceOff = activeOffense(sourceStep.off, state.playerCount);
  const sourceDef = effectiveDefensePositions(state, sourceStepIdx);

  const attackerIds = getActiveAttackerIds(state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);

  // Mirror défenseurs sourceStep → attaquants du step adverse.
  // Mapping nominal : D1 → O1, D2 → O2, etc. (préserve les rôles
  // postes au sein de chaque équipe).
  const off: AttackerPositions = {} as AttackerPositions;
  attackerIds.forEach((oId, i) => {
    const dId = defenderIds[i];
    const sourceDefPos = sourceDef[dId];
    if (sourceDefPos) {
      off[oId] = mirrorY({ x: sourceDefPos.x, y: sourceDefPos.y });
    } else {
      // Cas dégénéré : fallback sur position attaquant source mirroré
      off[oId] = mirrorY(sourceOff[oId] ?? { x: 300, y: 540 });
    }
  });

  // Mirror attaquants sourceStep → défenseurs du step adverse.
  const def: DefenderPositions = {} as DefenderPositions;
  defenderIds.forEach((dId, i) => {
    const oId = attackerIds[i];
    const sourceOffPos = sourceOff[oId];
    if (sourceOffPos) {
      def[dId] = mirrorY({ x: sourceOffPos.x, y: sourceOffPos.y });
    } else {
      def[dId] = mirrorY({ x: 300, y: 540 });
    }
  });

  // Porteur du step adverse : par défaut O1 (= mirror du défenseur D1
  // source, qui était le carrierDef ou le rebondeur).
  const ballCarrier: AttackerId = attackerIds[0];

  return { off, def, ballCarrier };
}
