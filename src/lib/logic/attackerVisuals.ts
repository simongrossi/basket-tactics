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
    } else if (prev) {
      // Sur la dernière étape (aucune étape suivante encore créée), un
      // non-porteur qui vient d'être déplacé (avec ou sans flèche) depuis
      // l'étape précédente garde le buste orienté dans son sens de course
      // tout en tournant la tête vers le porteur de balle (s'il est dans son
      // cône frontal ±75°) ou devant lui.
      const pp = activeOffense(prev.off, state.playerCount)[id];
      if (pp) {
        const dx = attackerPos.x - pp.x;
        const dy = attackerPos.y - pp.y;
        if (Math.hypot(dx, dy) > DRIBBLE_THRESHOLD_PX) {
          role = 'cutter';
          nextPos = { x: attackerPos.x + dx, y: attackerPos.y + dy };
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
    // Sprite V2 — flag "dribble actif" : porteur qui a bougé > DRIBBLE_THRESHOLD_PX
    // AVEC annotation `dribble` (même gating que `hasDribbleAnn` ci-dessus pour
    // éviter de confondre un drag manuel d'édition avec un dribble narratif).
    let isActivelyDribbling = false;
    if (role === 'carrier' && effectivePrevPos) {
      const dx = attackerPos.x - effectivePrevPos.x;
      const dy = attackerPos.y - effectivePrevPos.y;
      isActivelyDribbling = Math.hypot(dx, dy) > DRIBBLE_THRESHOLD_PX;
    }

    out[id] = {
      orientation: r.bodyOrientation,
      gazeOrientation: r.gazeOrientation,
      facing: r.facing,
      armBallSide: r.armBallSide,
      armManSide: r.armManSide,
      isActivelyDribbling,
      isPostShotRecovery: role === 'post-shot-recovery',
      isPassing: role === 'passer',
      isCutting: role === 'cutter',
    };
  });

  return out;
}

/**
 * Calcule les visuels attaquants pour une frame interpolée (lecture / scrub /
 * poursuite en direct) à partir des positions courantes `off`, des positions
 * de départ/arrivée du segment (`offA`, `offB`) ou de la frame précédente
 * (`prevOff`).
 *
 * Garantit que :
 *  1. `facing`, `armBallSide`, `armManSide` sont ancrés sur la position
 *     réellement affichée `off[id]` (et non sur l'endpoint `offB[id]`).
 *  2. Tout joueur en mouvement sur le segment `idxA → idxB` (avec ou sans
 *     flèche tracée) oriente son buste dans le sens réel de sa course
 *     et regarde devant lui ou vers le porteur de balle (dans la limite
 *     anatomique de ±75°).
 */
export function computeInterpolatedAttackerVisuals(params: {
  state: AppState;
  idxA: number;
  idxB: number;
  localT: number;
  off: Record<AttackerId, Point>;
  offA: Record<AttackerId, Point>;
  offB: Record<AttackerId, Point>;
  prevOff?: Partial<Record<AttackerId, Point>>;
  defPos: Record<string, Point>;
  carrier: AttackerId;
  carrierA: AttackerId;
  ballPos: Point;
  screen: { screener: AttackerId; carrierDef: string } | null;
  offBallScreens: Array<{ screener: AttackerId; cutterDef: string }>;
  attackerIsScreening: Partial<Record<AttackerId, boolean>>;
}): ComputedAttackerVisuals {
  const {
    state,
    idxA,
    idxB,
    localT,
    off,
    offA,
    offB,
    prevOff,
    defPos,
    carrier,
    carrierA,
    ballPos,
    screen,
    offBallScreens,
    attackerIsScreening,
  } = params;

  // Aux bornes exactes d'une étape statique sans mouvement inter-frame,
  // déléguer à `computeAttackerVisuals` pour préserver bit-à-bit les
  // invariants statiques aux endpoints.
  if (idxA === idxB && !prevOff) {
    return computeAttackerVisuals(state, idxA);
  }

  const stepA = state.steps[idxA];
  const stepB = state.steps[idxB] ?? stepA;
  const hoop = getDefenseHoop(state);

  const offBallScreenTargets = new Map<AttackerId, Point>();
  offBallScreens.forEach((o) => {
    const dPos = defPos[o.cutterDef];
    if (dPos) offBallScreenTargets.set(o.screener, dPos);
  });

  const out: ComputedAttackerVisuals = {} as ComputedAttackerVisuals;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const attackerPos = off[id];
    const startPos = offA[id] ?? attackerPos;
    const endPos = offB[id] ?? attackerPos;
    const prevFramePos = prevOff?.[id];

    const segDx = endPos.x - startPos.x;
    const segDy = endPos.y - startPos.y;
    const segDist = Math.hypot(segDx, segDy);

    const frameDx = prevFramePos ? attackerPos.x - prevFramePos.x : 0;
    const frameDy = prevFramePos ? attackerPos.y - prevFramePos.y : 0;
    const frameDist = Math.hypot(frameDx, frameDy);

    // Direction instantanée de course : tangente issue de prevFrame si le
    // joueur bouge à cette frame, sinon vecteur vers la cible de fin d'étape.
    let moveTargetPos: Point | undefined;
    if (frameDist > 0.35) {
      moveTargetPos = {
        x: attackerPos.x + (frameDx / frameDist) * 60,
        y: attackerPos.y + (frameDy / frameDist) * 60,
      };
    } else if (segDist > DRIBBLE_THRESHOLD_PX) {
      const toEndDx = endPos.x - attackerPos.x;
      const toEndDy = endPos.y - attackerPos.y;
      const toEndDist = Math.hypot(toEndDx, toEndDy);
      if (toEndDist > 1) {
        moveTargetPos = endPos;
      } else {
        moveTargetPos = {
          x: attackerPos.x + segDx,
          y: attackerPos.y + segDy,
        };
      }
    }

    const isMovingInSegment =
      (segDist > DRIBBLE_THRESHOLD_PX && localT > 0.001 && localT < 0.98) ||
      frameDist > 0.5;

    let role: AttackerRole = 'idle';
    let receiverPos: Point | undefined;
    let nextPos: Point | undefined;
    let screenTargetDefPos: Point | undefined;
    let effectivePrevPos: Point | undefined;

    if (id === carrier) {
      if (hasShotOutcome(stepB) && localT > 0.6) {
        role = 'shooter';
      } else {
        role = 'carrier';
        const hasDribbleAnn =
          stepA?.annotations.some((a) => a.type === 'dribble' && a.fromId === id) ||
          stepB?.annotations.some((a) => a.type === 'dribble' && a.fromId === id);
        if (isMovingInSegment && moveTargetPos) {
          // Pendant le déplacement (avec ou sans flèche de dribble), le porteur
          // oriente son corps et son regard dans le sens de sa course.
          effectivePrevPos = {
            x: attackerPos.x - (moveTargetPos.x - attackerPos.x),
            y: attackerPos.y - (moveTargetPos.y - attackerPos.y),
          };
        } else if (hasDribbleAnn && segDist > DRIBBLE_THRESHOLD_PX) {
          effectivePrevPos = startPos;
        }
      }
    } else if (stepA && carrierA === id && hasShotOutcome(stepA)) {
      role = 'post-shot-recovery';
    } else if ((attackerIsScreening[id] || (screen && screen.screener === id)) && screen && defPos[screen.carrierDef]) {
      role = 'screener';
      screenTargetDefPos = defPos[screen.carrierDef];
    } else if (offBallScreenTargets.has(id)) {
      role = 'screener';
      screenTargetDefPos = offBallScreenTargets.get(id)!;
    } else if (moveTargetPos && (segDist > DRIBBLE_THRESHOLD_PX || frameDist > 0.5)) {
      role = 'cutter';
      nextPos = moveTargetPos;
    } else if (carrierA === id && carrier !== id) {
      role = 'passer';
      receiverPos = off[carrier] ?? ballPos;
    }

    const manualOverride = state.attackerOrientations?.[id];
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

    const isActivelyDribbling = role === 'carrier' && !!effectivePrevPos;

    out[id] = {
      orientation: r.bodyOrientation,
      gazeOrientation: r.gazeOrientation,
      facing: r.facing,
      armBallSide: r.armBallSide,
      armManSide: r.armManSide,
      isActivelyDribbling,
      isPostShotRecovery: role === 'post-shot-recovery',
      isPassing: role === 'passer',
      isCutting: role === 'cutter',
    };
  });

  return out;
}

