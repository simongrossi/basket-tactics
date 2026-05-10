// Application de la contrainte de vitesse max sur les cibles défensives
// idéales calculées par `computeDefenseTargets`. Si un défenseur ne peut
// atteindre sa cible dans son budget de déplacement, il est marqué `late`
// et reste en chemin.
//
// Couches appliquées :
//  - Override manuel utilisateur (`step.defenseOverrides`) : prend le pas.
//  - Lever C : pré-relaxation de la cible hors des attaquants non-matchés.
//  - Lever A : longueur d'arc autour des clusters d'écran (la même physique
//    visuelle que le rendu du scrub côté CourtView/frameResolver).
//  - Lever B : friction de proximité (frôler un joueur réduit la vitesse max).
//  - Closeout : le défenseur du nouveau porteur bénéficie d'un bump de vitesse,
//    modulé par le profil offensif du porteur (shooter → +15%, non-shooter → -15%).
//  - Solveur de collisions : aucun défenseur ne se superpose à un autre joueur.
//  - Recompute orientations finales depuis les positions effectives.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  DefenderPositions,
  Point,
} from '../../types';
import { getZoneLayout, mirrorZoneLayout } from '../../data/zones';
import { DEFAULT_CLOSEOUT_BOOST, MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';
import {
  PLAYER_CLUSTER_BASE_R_PX,
  PLAYER_CLUSTER_LINK_DIST_PX,
} from '../../data/court';
import { closeoutProfileBonus } from '../help';
import { detectOffBallScreens, detectScreen } from '../screens';
import {
  makeCluster,
  pathArcLength,
  pickBlockingCluster,
  proximityFriction,
  pushOutOfMany,
  resolvePlayerCollisions,
} from '../geometry';
import {
  activeBallCarrier,
  activeDefenseInitial,
  activeOffense,
  getActiveDefenderIds,
} from '../players';
import {
  computeDefenseTargets,
  extractDefenderPositions,
  getDefenseHoop,
  getMatchupsAt,
} from '../engine';
import { recomputeDefenseFrameOrientations } from './frameAdjust';

interface ScreenerCluster {
  center: Point;
  radius: number;
  defenderToSkip: DefenderId;
}

/**
 * Calcule les positions effectives en appliquant la contrainte de vitesse max.
 * Si un défenseur ne peut atteindre sa cible, il est marqué "late" et reste
 * en chemin.
 */
export function effectiveDefensePositions(state: AppState, stepIdx: number): ComputedDefense {
  const { positions: targets } = computeDefenseTargets(state, stepIdx, true);
  const defenderIds = getActiveDefenderIds(state.playerCount);
  const curStep = state.steps[stepIdx];
  const curCarrier = activeBallCarrier(curStep, state.playerCount);

  const baseMaxSpeed = state.defenseSystem === 'zone'
    ? state.zoneConfig.rotationSpeed
    : state.defenseMaxSpeed;

  // Détection closeout : transition (stepIdx > 0) où le ballon a changé de mains
  // entre l'étape précédente et celle-ci, en défense individuelle uniquement.
  const isCloseoutTransition =
    stepIdx > 0 &&
    state.defenseSystem === 'man' &&
    activeBallCarrier(state.steps[stepIdx - 1], state.playerCount) !== curCarrier;

  // Over-closeout : closeout ET le nouveau porteur a driver vers le panier
  // entre N-1 et N (le défenseur arrivé trop fort se fait déborder).
  let isOverClosedTransition = false;
  if (isCloseoutTransition) {
    const newCarrier = curCarrier;
    const prevP = activeOffense(state.steps[stepIdx - 1].off, state.playerCount)[newCarrier];
    const curP = activeOffense(curStep.off, state.playerCount)[newCarrier];
    if (prevP && curP) {
      const hoop = getDefenseHoop(state);
      const prevD = Math.hypot(prevP.x - hoop.x, prevP.y - hoop.y);
      const curD = Math.hypot(curP.x - hoop.x, curP.y - hoop.y);
      isOverClosedTransition = prevD - curD > 25 && curD < 250;
    }
  }

  let prevPositions: DefenderPositions;
  if (stepIdx === 0) {
    if (state.defenseSystem === 'zone') {
      const baseLayout = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
      const layout = (state.attackingDirection === 'down' ? mirrorZoneLayout(baseLayout) : baseLayout)
        .filter((z) => defenderIds.includes(z.assignedTo));
      prevPositions = {} as DefenderPositions;
      layout.forEach((z) => { prevPositions[z.assignedTo] = { ...z.homePos }; });
    } else {
      prevPositions = activeDefenseInitial(state.defenseInitial, state.playerCount);
    }
  } else {
    prevPositions = extractDefenderPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
  }

  const overrides = state.steps[stepIdx]?.defenseOverrides;
  const offAtStep = activeOffense(state.steps[stepIdx]?.off ?? {} as AttackerPositions, state.playerCount);

  // Construit les clusters d'écran à contourner (poseur + son défenseur, fusionnés
  // en une seule masse). Seulement en défense individuelle — la zone n'a pas de
  // détection d'écran formelle. Mirroite la logique de CourtView pour que la
  // physique du moteur et le rendu du scrub utilisent les MÊMES obstacles.
  const screenerObstacles: ScreenerCluster[] = [];
  if (state.defenseSystem === 'man' && stepIdx > 0) {
    const cur = state.steps[stepIdx];
    const curOff = activeOffense(cur.off, state.playerCount);
    const carrier = activeBallCarrier(cur, state.playerCount);
    const matchupsForScreen = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
    const prevOffEff = activeOffense(state.steps[stepIdx - 1].off, state.playerCount);
    const screen = detectScreen(
      curOff, carrier, matchupsForScreen, prevPositions, state.screenRadius, cur.forcedScreener, prevOffEff
    );
    const offBallScreens = detectOffBallScreens(
      curOff, carrier, matchupsForScreen, prevPositions, state.screenRadius, prevOffEff
    );
    if (screen) {
      const sPos = curOff[screen.screener];
      const sDef = prevPositions[screen.screenerDef];
      const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef });
    }
    offBallScreens.forEach((s) => {
      const sPos = curOff[s.screener];
      const sDef = prevPositions[s.screenerDef];
      const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: s.screenerDef });
    });
  }

  const out = {} as ComputedDefense;
  defenderIds.forEach((dId) => {
    // Override manuel utilisateur : prend toujours le pas sur le calcul.
    if (overrides?.[dId]) {
      const pos = overrides[dId]!;
      out[dId] = {
        x: pos.x,
        y: pos.y,
        late: false,
        helpFactor: targets[dId].helpFactor,
        isCarrierDefender: targets[dId].isCarrierDefender,
        matchedTo: targets[dId].matchedTo,
        onScreen: targets[dId].onScreen,
        switchedThisStep: targets[dId].switchedThisStep,
        denying: targets[dId].denying,
        helpTriggered: targets[dId].helpTriggered,
        pnrRole: targets[dId].pnrRole,
        orientation: targets[dId].orientation,
        gazeOrientation: targets[dId].gazeOrientation,
        facing: targets[dId].facing,
        armBallSide: targets[dId].armBallSide,
        armManSide: targets[dId].armManSide,
        helpAim: targets[dId].helpAim,
        helpPriority: targets[dId].helpPriority,
        helpKind: targets[dId].helpKind,
      };
      return;
    }

    const from = prevPositions[dId];
    const rawTarget = targets[dId];
    const matched = rawTarget.matchedTo;

    // Lever C — Pré-relaxation de la cible : si la cible idéale chevauche un
    // attaquant non-matché, on la repousse à l'écart. Évite que la contrainte
    // de vitesse compare une distance qui mène DANS un autre joueur.
    const nonMatchedAttackerPositions: Point[] = [];
    (Object.entries(offAtStep) as [AttackerId, Point][]).forEach(([oId, pos]) => {
      if (oId !== matched) nonMatchedAttackerPositions.push(pos);
    });
    const relaxed = pushOutOfMany(
      { x: rawTarget.x, y: rawTarget.y },
      nonMatchedAttackerPositions,
      MIN_PLAYER_CLEARANCE_PX
    );
    const to = { x: relaxed.x, y: relaxed.y };

    // Lever A — Longueur d'arc : si le segment from→to traverse un cluster
    // d'écran, on calcule la longueur de la trajectoire courbe Bezier (celle
    // que CourtView trace pendant le scrub). Le défenseur "paie" le détour.
    const candidates = screenerObstacles.filter((o) => dId !== o.defenderToSkip);
    const blocking = pickBlockingCluster(from, to, candidates);
    const pathLen = pathArcLength(from, to, blocking);

    // Lever B — Friction de proximité : si le trajet frôle un joueur non-
    // matché (attaquant non visé OU autre défenseur), on baisse la vitesse
    // max. Modélise le contact "épaule" hors écran formel.
    const frictionObstacles: Point[] = [...nonMatchedAttackerPositions];
    defenderIds.forEach((other) => {
      if (other !== dId) frictionObstacles.push(prevPositions[other]);
    });
    const friction = proximityFriction(from, to, frictionObstacles);

    // Closeout : le défenseur du nouveau porteur bénéficie d'un bump de vitesse.
    const closingOut = isCloseoutTransition && targets[dId].isCarrierDefender;
    const overClosed = isOverClosedTransition && targets[dId].isCarrierDefender;
    // Override par défenseur > global > défaut, modulé par le profil offensif
    // du porteur sur lequel on closeoute (shooter → +15%, non-shooter → -15%).
    const ruleBoost = state.rules[dId]?.closeoutBoost;
    const profileBonus = closingOut
      ? closeoutProfileBonus(state.attackerProfiles?.[curCarrier])
      : 1;
    const closeoutBoost = (ruleBoost ?? state.closeoutBoost ?? DEFAULT_CLOSEOUT_BOOST) * profileBonus;
    // Vitesse max individuelle (rule.maxSpeed) > globale (en zone, on garde la rotation)
    const indivMaxSpeed = state.defenseSystem === 'man'
      ? (state.rules[dId]?.maxSpeed ?? baseMaxSpeed)
      : baseMaxSpeed;
    const maxSpeed = closingOut ? indivMaxSpeed * closeoutBoost : indivMaxSpeed;
    // Pénalité de contact d'écran : un défenseur du porteur qui prend un
    // écran perd du temps à se dégager. Représente le "bump" physique : le
    // défenseur ne traverse pas le poseur instantanément, il négocie le
    // contact. Friction et pathArcLength capturent déjà une partie, mais
    // pas suffisamment pour matcher l'intuition basket : un D1 qui prend un
    // écran tight perd typiquement 0.3-0.6 sec, soit ~50% de sa vitesse sur
    // une étape d'animation.
    const isCarrierDefScreenedThisStep =
      targets[dId].onScreen === true && targets[dId].isCarrierDefender;
    const screenContactPenalty = isCarrierDefScreenedThisStep ? 0.55 : 1.0;
    // Vitesse effective = vitesse théorique × friction × pénalité écran.
    const effectiveMaxSpeed = maxSpeed * friction * screenContactPenalty;

    // À l'étape 0, on considère que les défenseurs SONT à leur position idéale
    // (le step 0 est un setup, pas une transition). La contrainte de vitesse
    // ne s'applique qu'entre les étapes suivantes.
    if (stepIdx === 0 || pathLen <= effectiveMaxSpeed) {
      out[dId] = {
        x: to.x,
        y: to.y,
        late: false,
        helpFactor: targets[dId].helpFactor,
        isCarrierDefender: targets[dId].isCarrierDefender,
        matchedTo: targets[dId].matchedTo,
        onScreen: targets[dId].onScreen,
        switchedThisStep: targets[dId].switchedThisStep,
        closingOut: closingOut || undefined,
        overClosed: overClosed || undefined,
        denying: targets[dId].denying,
        helpTriggered: targets[dId].helpTriggered,
        pnrRole: targets[dId].pnrRole,
        orientation: targets[dId].orientation,
        gazeOrientation: targets[dId].gazeOrientation,
        facing: targets[dId].facing,
        armBallSide: targets[dId].armBallSide,
        armManSide: targets[dId].armManSide,
        helpAim: targets[dId].helpAim,
        helpPriority: targets[dId].helpPriority,
        helpKind: targets[dId].helpKind,
      };
    } else {
      const r = effectiveMaxSpeed / pathLen;
      out[dId] = {
        x: Math.round(from.x + (to.x - from.x) * r),
        y: Math.round(from.y + (to.y - from.y) * r),
        late: true,
        helpFactor: targets[dId].helpFactor,
        isCarrierDefender: targets[dId].isCarrierDefender,
        matchedTo: targets[dId].matchedTo,
        onScreen: targets[dId].onScreen,
        switchedThisStep: targets[dId].switchedThisStep,
        closingOut: closingOut || undefined,
        overClosed: overClosed || undefined,
        denying: targets[dId].denying,
        helpTriggered: targets[dId].helpTriggered,
        pnrRole: targets[dId].pnrRole,
        orientation: targets[dId].orientation,
        gazeOrientation: targets[dId].gazeOrientation,
        facing: targets[dId].facing,
        armBallSide: targets[dId].armBallSide,
        armManSide: targets[dId].armManSide,
        helpAim: targets[dId].helpAim,
        helpPriority: targets[dId].helpPriority,
        helpKind: targets[dId].helpKind,
      };
    }
  });

  // Solveur de collisions : aucun défenseur ne peut se superposer à un
  // autre joueur (sauf son matchedTo).
  resolvePlayerCollisions(out as unknown as Record<string, ComputedDefense[DefenderId]>, offAtStep, MIN_PLAYER_CLEARANCE_PX);
  // Re-arrondit après résolution
  defenderIds.forEach((dId) => {
    out[dId].x = Math.round(out[dId].x);
    out[dId].y = Math.round(out[dId].y);
  });

  recomputeDefenseFrameOrientations(state, offAtStep, curCarrier, out);

  return out;
}
