// F.2 V1+V2 — Press defense.
//
// V1 (half-court 2-2-1) : pression demi-terrain statique.
// V2 (full-court 1-2-1-1) : pression tout terrain + trap dynamique
// quand le porteur franchit la ligne médiane.
//
// Pattern identique à F.1 junk : court-circuit du pipeline man comme
// la zone. Aucune modification de getDefenseHoop, screens/, defense/*.
// → Zéro risque Règle 1bis CLAUDE.md.
//
// V2 reportés volontairement : retreat progressive si press cassée
// (60% du chemin → retour homme-à-homme). Trop complexe pour valeur
// marginale en V2 minimal.

import type { AppState, DefenderId, Matchups, Point, PressType } from '../../types';
import { baseMatchups } from '../../data/initial';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';
import { computeDefenderOrientation } from '../orientation';
import type { DefenderTarget } from './types';
import {
  PRESS_TRAP_PULL_PX as TRAP_PULL_PX,
  PRESS_TRAP_CROSS_THRESHOLD_Y as TRAP_CROSS_THRESHOLD_Y,
} from './constants';

/** Formation 2-2-1 half-court (V1, 5 défenseurs) :
 *  - 2 sur la ligne médiane (= entrée du terrain offensif)
 *  - 2 sur la zone de relais (= 1/3 supérieur, vers le panier offense)
 *  - 1 protecteur arrière au centre (= sweeper sous le panier defense)
 *
 *  Coordonnées exprimées en deltas depuis le panier DÉFENSE (hoop).
 *  `dy < 0` signifie "vers le panier offense" (= vers le HAUT du
 *  terrain si attackingDirection='up').
 *
 *  Le sign dy est inversé selon attackingDirection plus bas dans
 *  computePressDefenseTargets. */
const PRESS_2_2_1_OFFSETS: Array<{ dx: number; dy: number; role: string }> = [
  // Front line — ligne médiane (haut du terrain offensif)
  { dx: -120, dy: -460, role: 'front-left' },   // D2 typique
  { dx: +120, dy: -460, role: 'front-right' },  // D3 typique
  // Mid line — zone de relais (entre médiane et 3pt offense)
  { dx: -110, dy: -250, role: 'mid-left' },     // D1 typique
  { dx: +110, dy: -250, role: 'mid-right' },    // D4 typique
  // Sweeper — protecteur arrière (centre, près panier defense)
  { dx: 0,    dy: -50,  role: 'sweeper' },      // D5 typique
];

/** Formation 1-2-1-1 full-court (V2, 5 défenseurs) :
 *  - 1 chaser tout en haut sur le porteur (= pression remise en jeu côté
 *    panier adverse, dy ≈ -720 = quasi sous le panier offense)
 *  - 2 wings en seconde ligne (zone backcourt adverse)
 *  - 1 protecteur ligne médiane (= centre, dy ≈ -460)
 *  - 1 sweeper sous panier défense
 *
 *  Géométrie typique 1-2-1-1 NCAA / NBA. Plus agressive que 2-2-1. */
const PRESS_1_2_1_1_OFFSETS: Array<{ dx: number; dy: number; role: string }> = [
  // Chaser — sous panier offense (= remise en jeu adverse)
  { dx: 0,    dy: -720, role: 'chaser' },        // D1 typique
  // Wings — seconde ligne backcourt adverse
  { dx: -130, dy: -580, role: 'wing-left' },     // D2 typique
  { dx: +130, dy: -580, role: 'wing-right' },    // D3 typique
  // Mid — protecteur ligne médiane
  { dx: 0,    dy: -460, role: 'mid' },           // D4 typique
  // Sweeper — sous notre panier
  { dx: 0,    dy: -50,  role: 'sweeper' },       // D5 typique
];

/** Retourne les offsets selon le type de press. */
function offsetsForType(type: PressType): Array<{ dx: number; dy: number; role: string }> {
  if (type === 'full-court' || type === '1-2-1-1') return PRESS_1_2_1_1_OFFSETS;
  return PRESS_2_2_1_OFFSETS; // half-court / 2-2-1
}

/** True si le type de press est full-court (= concerne le V2). */
export function isFullCourtPress(type: PressType): boolean {
  return type === 'full-court' || type === '1-2-1-1';
}

export function computePressDefenseTargets(
  state: AppState,
  stepIdx: number,
): { positions: Record<DefenderId, DefenderTarget>; matchupsApplied: Matchups } {
  const cur = state.steps[stepIdx];
  const off = activeOffense(cur.off, state.playerCount);
  const carrier = activeBallCarrier(cur, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const hoop = getDefenseHoop(state);

  // Type de press : V1 'half-court' / '2-2-1' ou V2 'full-court' / '1-2-1-1'.
  const pressType: PressType = state.pressConfig?.type ?? 'half-court';
  const offsets = offsetsForType(pressType);

  // Sens "vers le panier offense" : si hoop.y < 300 (attackingDirection='up',
  // panier defense en haut), alors le panier offense est en bas (y > hoop.y).
  // dy < 0 dans nos offsets = direction "vers offense", donc on flip si
  // hoop.y > 300 (attackingDirection='down').
  const dySign = hoop.y < 300 ? -1 : 1;

  const positions = {} as Record<DefenderId, DefenderTarget>;
  const matchupsApplied: Matchups = { ...baseMatchups };

  // Assigne dans l'ordre des défenseurs actifs aux slots presse du type.
  defenderIds.forEach((dId, i) => {
    const slot = offsets[i % offsets.length];
    const x = hoop.x + slot.dx;
    const y = hoop.y + slot.dy * dySign;
    const matched = baseMatchups[dId];
    const manPos: Point = off[matched] ?? off[carrier] ?? { x: hoop.x, y: hoop.y };
    const ballPos: Point = off[carrier] ?? hoop;
    const ori = computeDefenderOrientation({
      defenderPos: { x, y },
      manPos,
      ballPos,
      isCarrierDefender: false,
      stance: 'sag',
    });
    positions[dId] = {
      x, y,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: matched,
      onScreen: false,
      switchedThisStep: false,
      orientation: ori.bodyOrientation,
      gazeOrientation: ori.gazeOrientation,
      facing: ori.facing,
      armBallSide: ori.armBallSide,
      armManSide: ori.armManSide,
      helpKind: 'none',
    };
  });

  // F.2 V2 — Trap dynamique : si le type est full-court (trap activé
  // par défaut) ET le porteur a franchi la ligne médiane (= côté
  // offense), les 2 défenseurs les plus proches du porteur sautent
  // dessus pour piège.
  const trapEnabled =
    state.pressConfig?.trapOnHalfCourtCross ?? isFullCourtPress(pressType);
  const carrierPos = off[carrier];
  if (trapEnabled && carrierPos && hasCrossedHalfCourt(carrierPos, hoop)) {
    applyTrapPull(positions, defenderIds, carrierPos);
  }

  return { positions, matchupsApplied };
}

/** Détermine si le porteur est dans la moitié offense (= a franchi la
 *  médiane).
 *  - attackingDirection='up' (hoop.y < 300) : porteur côté offense si y < 540.
 *  - attackingDirection='down' (hoop.y > 600) : porteur côté offense si y > 540.
 */
function hasCrossedHalfCourt(carrierPos: Point, hoop: Point): boolean {
  if (hoop.y < 300) {
    // attaque vers le haut, offense est y < 540 (= terrain offensif)
    return carrierPos.y < TRAP_CROSS_THRESHOLD_Y;
  }
  // attaque vers le bas, offense est y > 540
  return carrierPos.y > TRAP_CROSS_THRESHOLD_Y;
}

/** Tire les 2 défenseurs les plus proches du porteur vers lui de
 *  TRAP_PULL_PX (en plus de leur position presse calculée). */
function applyTrapPull(
  positions: Record<DefenderId, DefenderTarget>,
  defenderIds: DefenderId[],
  carrierPos: Point,
): void {
  // Calcule distance de chaque défenseur au porteur (post-press placement).
  const dists = defenderIds.map((dId) => ({
    dId,
    dist: Math.hypot(positions[dId].x - carrierPos.x, positions[dId].y - carrierPos.y),
  }));
  dists.sort((a, b) => a.dist - b.dist);
  // Top 2 = trappers.
  const trappers = dists.slice(0, 2);
  trappers.forEach(({ dId }) => {
    const t = positions[dId];
    const dx = carrierPos.x - t.x;
    const dy = carrierPos.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const pull = Math.min(TRAP_PULL_PX, d - 30); // garde > clearance min
    if (pull <= 0) return;
    positions[dId].x = t.x + (dx / d) * pull;
    positions[dId].y = t.y + (dy / d) * pull;
  });
}

/** Export pour les tests. */
export { PRESS_2_2_1_OFFSETS, PRESS_1_2_1_1_OFFSETS, TRAP_PULL_PX, TRAP_CROSS_THRESHOLD_Y };
