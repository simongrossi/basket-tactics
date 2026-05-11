// Ajustements appliqués à une frame défensive APRÈS le calcul des cibles
// idéales et la contrainte de vitesse :
//
//  - `followDefendersAtFrame` : chaque défenseur en marquage individuel
//    suit en TEMPS RÉEL la position courante de son homme (sinon il coupe
//    au plus court entre defA et defB et lâche son homme pendant un V-cut /
//    une wave dribble / une polyline courbe).
//
//  - `recomputeDefenseFrameOrientations` : recalcule body/gaze/facing depuis
//    les positions réellement affichées (post-vitesse, post-interpolation,
//    post-contournement, post-collisions). Sans ça, le triangle pointeur ou
//    le champ de vision partiraient d'une position obsolète.
//
// Ces deux fonctions sont des "post-passes" pures sur un `ComputedDefense`
// déjà construit. Elles vivent ici, séparées d'engine.ts, parce qu'elles
// sont consommées par le frameResolver de playback (cf. playback/frameResolver.ts)
// et n'ont pas besoin du gros machinerie de `computeDefenseTargets`.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '../../types';
import { carrierDefenderTarget, manTarget, offBallStanceTarget } from '../manDefense';
import { computeDefenderOrientation } from '../orientation';
import { getActiveDefenderIds } from '../players';
import { getDefenseHoop } from '../engine';

/**
 * En lecture, chaque défenseur en marquage individuel doit suivre EN TEMPS
 * RÉEL la position courante de son attaquant.
 *
 * Comportement :
 *  - Carrier defender → `carrierDefenderTarget` (vsCarrier, distance, hoop)
 *  - Off-ball → `offBallStanceTarget` (stance, ball) ou `manTarget` (sag/behind)
 *  - Skipped si l'utilisateur a posé un placement manuel (`defenseOverrides`)
 *    sur l'une des deux étapes du segment — sa position imposée prime.
 *  - Skipped si le défenseur est dans `skipIds` (typiquement les défenseurs
 *    en phase de contact d'écran, dont la position a déjà été calculée avec
 *    freeze/courbe/easing et ne doit pas être réécrite).
 *
 * NB : aide (`helpFactor`, `helpAim`), closeout, denying restent ceux calculés
 * par `effectiveDefensePositions` aux étapes A/B et interpolés. Cette fonction
 * réécrit uniquement la POSITION de marquage, pas les flags d'état.
 */
export function followDefendersAtFrame(
  defPos: ComputedDefense,
  off: AttackerPositions,
  ballCarrier: AttackerId,
  state: AppState,
  idxA: number,
  idxB: number,
  skipIds?: ReadonlySet<DefenderId>
): void {
  const carrierPos = off[ballCarrier];
  const hoop = getDefenseHoop(state);
  const overridesA = state.steps[idxA]?.defenseOverrides ?? {};
  const overridesB = state.steps[idxB]?.defenseOverrides ?? {};

  for (const dId of getActiveDefenderIds(state.playerCount)) {
    const slot = defPos[dId];
    if (!slot) continue;
    // Placement manuel sur l'une des deux étapes → la position imposée prime,
    // on garde l'interpolation linéaire entre override(A) et calc(B) ou inverse.
    if (overridesA[dId] || overridesB[dId]) continue;
    // Phase de contact d'écran → la position a été calculée avec freeze +
    // courbe + apex slowness. Ne PAS la réécrire en suivant l'homme : sinon
    // D1 se "téléporterait" instantanément sur le porteur, court-circuitant
    // tout le réalisme du contact.
    if (skipIds && skipIds.has(dId)) continue;
    // Si le moteur a marqué ce défenseur 'late' en raison d'une RECOVERY
    // d'écran (screenPhase='recover'), on respecte sa position calculée
    // (qui prend en compte la pénalité de vitesse) — sinon `followDefenders`
    // le téléporterait au porteur, court-circuitant le recover. Pour les
    // autres défenseurs late (raison non-écran : juste un déplacement long),
    // on les laisse suivre comme avant.
    if (slot.late && slot.screenPhase === 'recover') continue;
    const rule = state.rules[dId];
    if (!rule) continue;
    const dist = rule.distance ?? state.defenseDistance;

    // On suit TOUJOURS l'homme assigné (`slot.matchedTo`), pas le ballCarrier
    // courant. Pendant une transition de balle (segment où le porteur change
    // entre A et B), `slot.isCarrierDefender` peut être true pour un défenseur
    // qui ne défend PAS encore le porteur courant — il défend son homme qui
    // VA recevoir la balle. Le tirer sur le porteur courant le téléporte sur
    // l'attaquant fauteur, alors qu'il devrait juste anticiper sa rotation
    // sur son propre homme (qui devient porteur).
    const myMan = off[slot.matchedTo];
    if (!myMan) continue;

    let tgt: Point | null = null;
    const myManIsCurrentCarrier = slot.matchedTo === ballCarrier;
    if (myManIsCurrentCarrier) {
      tgt = carrierDefenderTarget(rule.vsCarrier, myMan, dist, hoop);
    } else {
      const stance = rule.offBallStance;
      // Position du ballon ≈ position du porteur (approximation OK hors passe
      // en vol, où les stances fronting/deny ne sont pas critiques visuellement).
      tgt = stance && carrierPos
        ? offBallStanceTarget(myMan, carrierPos, dist, stance, hoop)
        : manTarget(myMan, dist, hoop);
    }
    if (tgt) {
      // Pas d'arrondi ici : la position est consommée par l'interpolation
      // de frame qui peut faire varier la position continûment. Un round
      // intermédiaire perd la précision sub-pixel et fait ressembler la
      // trajectoire à un mouvement par paliers. L'arrondi final (le cas
      // échéant) se fait au niveau du rendu uniquement.
      slot.x = tgt.x;
      slot.y = tgt.y;
    }
  }
}

/**
 * Recalcule body/gaze/facing depuis les positions réellement affichées.
 * À utiliser après vitesse, interpolation, contournement et collisions pour
 * que triangle + champ de vision partent toujours du joueur visible.
 */
export function recomputeDefenseFrameOrientations(
  state: AppState,
  offAtStep: AttackerPositions,
  ballCarrier: AttackerId,
  defPos: ComputedDefense
): ComputedDefense {
  const ballPos = offAtStep[ballCarrier];
  getActiveDefenderIds(state.playerCount).forEach((dId) => {
    const slot = defPos[dId];
    const rule = state.rules[dId];
    if (!slot || !rule) return;
    const defenderPos = { x: slot.x, y: slot.y };
    const recomputed = computeDefenderOrientation({
      defenderPos,
      manPos: offAtStep[slot.matchedTo] ?? defenderPos,
      ballPos: ballPos ?? defenderPos,
      isCarrierDefender: slot.isCarrierDefender,
      stance: rule.offBallStance,
      vsCarrier: rule.vsCarrier,
      pnrRole: slot.pnrRole,
      manualDelta: rule.orientation ?? 0,
      manualBody: rule.bodyOrientation,
      bodyMode: rule.bodyOrientationMode,
      gazeLock: rule.gazeLock,
    });
    slot.orientation = recomputed.bodyOrientation;
    slot.gazeOrientation = recomputed.gazeOrientation;
    slot.facing = recomputed.facing;
    slot.armBallSide = recomputed.armBallSide;
    slot.armManSide = recomputed.armManSide;
  });
  return defPos;
}
