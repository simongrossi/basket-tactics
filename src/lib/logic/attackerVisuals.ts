// Calcul orientation + facing pour chaque attaquant à une étape donnée.
// Vit séparément de la logique défensive (engine.ts) : c'est de la dérivation
// visuelle (rôle métier → corps/regard/bras), aucun lien avec speed/help/screens
// côté défenseurs.

import type {
  AppState,
  AttackerId,
  ComputedAttackerVisuals,
  Point,
} from '../types';
import { activeBallCarrier, activeDefenseInitial, activeOffense } from './players';
import { computeAttackerOrientation, type AttackerRole } from './orientation';
import { detectOffBallScreens, detectScreen } from './screens';
import { hasShotOutcome } from './shotTracking';
import { DRIBBLE_THRESHOLD_PX } from '../constants/gameplay';
import {
  computeDefenseTargets,
  extractDefenderPositions,
  getDefenseHoop,
  getMatchupsAt,
} from './engine';

/**
 * Les rôles sont déduits du contexte :
 *  - `carrier` : le porteur de balle.
 *  - `passer` : à la transition stepIdx-1 → stepIdx, l'ex-porteur (s'il y a
 *    eu changement de carrier) regarde le NOUVEAU porteur (receveur).
 *  - `cutter` : un non-porteur dont le delta vers l'étape SUIVANTE est
 *    > DRIBBLE_THRESHOLD_PX (il s'apprête à bouger, son orientation suit la course).
 *  - `screener` : si un écran est détecté (porteur ou off-ball), le poseur
 *    s'oriente perpendiculairement à la ligne screener→défenseur ciblé.
 *  - `idle` : aucun rôle particulier → regarde le ballon.
 */
export function computeAttackerVisuals(
  state: AppState,
  stepIdx: number
): ComputedAttackerVisuals {
  const cur = state.steps[stepIdx];
  if (!cur) return {} as ComputedAttackerVisuals;
  const off = activeOffense(cur.off, state.playerCount);
  const carrier = activeBallCarrier(cur, state.playerCount);
  const ballPos = off[carrier];
  const hoop = getDefenseHoop(state);
  const next = state.steps[stepIdx + 1];
  const prev = state.steps[stepIdx - 1];

  // Détection écran porteur + off-ball pour les rôles screener (man uniquement).
  let detectedScreener: AttackerId | null = null;
  let screenerTargetDef: Point | null = null;
  const offBallScreeners = new Map<AttackerId, Point>();
  if (state.defenseSystem === 'man') {
    const matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
    const prevDef =
      stepIdx === 0
        ? activeDefenseInitial(state.defenseInitial, state.playerCount)
        : extractDefenderPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
    const prevOffArg = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : undefined;
    const sc = detectScreen(off, carrier, matchups, prevDef, state.screenRadius, cur.forcedScreener, prevOffArg);
    if (sc) {
      detectedScreener = sc.screener;
      screenerTargetDef = prevDef[sc.carrierDef];
    }
    const obs = detectOffBallScreens(off, carrier, matchups, prevDef, state.screenRadius, prevOffArg);
    obs.forEach((o) => {
      offBallScreeners.set(o.screener, prevDef[o.cutterDef]);
    });
  }

  const out: ComputedAttackerVisuals = {} as ComputedAttackerVisuals;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const attackerPos = off[id];
    let role: AttackerRole = 'idle';
    let receiverPos: Point | undefined;
    let nextPos: Point | undefined;
    let screenTargetDefPos: Point | undefined;

    if (id === carrier) {
      if (hasShotOutcome(cur)) {
        role = 'shooter';
      } else {
        role = 'carrier';
      }
    } else if (prev && activeBallCarrier(prev, state.playerCount) === id && hasShotOutcome(prev)) {
      // Le tireur du step précédent est en phase de recovery post-tir
      role = 'post-shot-recovery';
    } else if (prev && activeBallCarrier(prev, state.playerCount) === id && carrier !== id) {
      // L'ex-porteur regarde le receveur (transition de balle).
      role = 'passer';
      receiverPos = off[carrier];
    } else if (id === detectedScreener && screenerTargetDef) {
      role = 'screener';
      screenTargetDefPos = screenerTargetDef;
    } else if (offBallScreeners.has(id)) {
      role = 'screener';
      screenTargetDefPos = offBallScreeners.get(id)!;
    } else if (next) {
      const np = activeOffense(next.off, state.playerCount)[id];
      if (np) {
        const dx = np.x - attackerPos.x;
        const dy = np.y - attackerPos.y;
        if (Math.hypot(dx, dy) > DRIBBLE_THRESHOLD_PX) {
          role = 'cutter';
          nextPos = np;
        }
      }
    }

    const manualOverride = state.attackerOrientations?.[id];
    // Bug fix orientation porteur : la détection delta-based "dribble"
    // (orientation.ts:detectDribbleTarget) confond un déplacement manuel
    // par drag avec un dribble narratif. On gate `prevPos` côté porteur
    // par l'existence d'une annotation `dribble` réelle (step courant OU
    // précédent, selon la convention timing). Sans annotation = manuel
    // = porteur face au panier (règle par défaut). Pour les non-porteurs,
    // prevPos n'est de toute façon pas utilisé par orientation.ts.
    let effectivePrevPos: Point | undefined;
    if (prev) {
      if (id === carrier) {
        const hasDribbleAnn =
          cur.annotations.some((a) => a.type === 'dribble' && a.fromId === id) ||
          prev.annotations.some((a) => a.type === 'dribble' && a.fromId === id);
        if (hasDribbleAnn) {
          effectivePrevPos = activeOffense(prev.off, state.playerCount)[id];
        }
      } else {
        effectivePrevPos = activeOffense(prev.off, state.playerCount)[id];
      }
    }
    const r = computeAttackerOrientation({
      attackerPos,
      role,
      ballPos: ballPos ?? attackerPos,
      hoop,
      receiverPos,
      nextPos,
      screenTargetDefPos,
      prevPos: effectivePrevPos,
      manualBody: manualOverride?.body,
      manualGaze: manualOverride?.gaze,
    });
    out[id] = {
      orientation: r.bodyOrientation,
      gazeOrientation: r.gazeOrientation,
      facing: r.facing,
      armBallSide: r.armBallSide,
      armManSide: r.armManSide,
    };
  });

  return out;
}
