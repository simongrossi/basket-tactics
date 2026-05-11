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
  DetectedOffBallScreen,
  Point,
} from '../../types';
import { buildStep0DetectionPositions } from '../step0Detection';
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
import {
  anticipationTarget,
  findScreenQuality,
  screenPenaltyFromQuality,
} from '../screenPhysics';

export { screenPenaltyFromQuality } from '../screenPhysics';

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
  let prevTargets: ReturnType<typeof computeDefenseTargets>['positions'] | null = null;
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
    prevTargets = computeDefenseTargets(state, stepIdx - 1, false).positions;
    prevPositions = extractDefenderPositions(prevTargets);
  }

  const overrides = state.steps[stepIdx]?.defenseOverrides;
  const offAtStep = activeOffense(state.steps[stepIdx]?.off ?? {} as AttackerPositions, state.playerCount);

  // Construit les clusters d'écran à contourner (poseur + son défenseur, fusionnés
  // en une seule masse). Seulement en défense individuelle — la zone n'a pas de
  // détection d'écran formelle. Mirroite la logique de CourtView pour que la
  // physique du moteur et le rendu du scrub utilisent les MÊMES obstacles.
  const screenerObstacles: ScreenerCluster[] = [];
  // Qualité des écrans courants/précédents : 0-100, 50 par défaut. Module
  // la pénalité de vitesse par défenseur, porteur comme hors-ballon.
  const currentScreenQualityByDef: Partial<Record<DefenderId, number>> = {};
  const previousScreenQualityByDef: Partial<Record<DefenderId, number>> = {};
  if (state.defenseSystem === 'man') {
    const cur = state.steps[stepIdx];
    const curOff = activeOffense(cur.off, state.playerCount);
    const carrier = activeBallCarrier(cur, state.playerCount);
    // À l'étape 0, on n'a pas de "prevOff" — on utilise les positions
    // courantes comme proxy. La détection d'écran fonctionne quand même
    // car elle repose sur la géométrie poseur/cible/porteur.
    const matchupsForScreen = stepIdx > 0
      ? getMatchupsAt(state.steps, stepIdx - 1, state.playerCount)
      : getMatchupsAt(state.steps, 0, state.playerCount);
    const prevOffEff = stepIdx > 0
      ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount)
      : curOff;
    // Pour la détection d'écran à step 0, on substitue la position du
    // carrier defender par sa cible homme-à-homme (cf. comment dans
    // context.ts/buildStep0PrevPositions). Sinon detectScreen rate les
    // écrans car D1 n'a pas encore "rejoint" le jeu.
    const detectionPositions: DefenderPositions = stepIdx === 0
      ? buildStep0DetectionPositions(state, curOff, carrier, matchupsForScreen, prevPositions)
      : prevPositions;
    const screen = detectScreen(
      curOff, carrier, matchupsForScreen, detectionPositions, state.screenRadius, cur.forcedScreener, prevOffEff
    );
    const offBallScreens = detectOffBallScreens(
      curOff, carrier, matchupsForScreen, detectionPositions, state.screenRadius, prevOffEff
    );
    if (screen) {
      const sPos = curOff[screen.screener];
      // À step 0, on utilise la position de détection (cible homme-à-homme)
      // pour D-screener afin que le cluster soit centré sur l'écran réel et
      // non entre O3 et la défense initiale (qui est loin du jeu).
      const sDef = detectionPositions[screen.screenerDef];
      const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef });
      currentScreenQualityByDef[screen.carrierDef] = findScreenQuality(
        [state.steps[stepIdx], state.steps[stepIdx - 1]],
        screen.screener
      );
    }
    offBallScreens.forEach((s) => {
      const sPos = curOff[s.screener];
      const sDef = detectionPositions[s.screenerDef];
      const c = makeCluster(sPos, [sDef], PLAYER_CLUSTER_LINK_DIST_PX, PLAYER_CLUSTER_BASE_R_PX);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: s.screenerDef });
      currentScreenQualityByDef[s.cutterDef] = offBallScreenQuality(
        [state.steps[stepIdx], state.steps[stepIdx - 1]],
        s
      );
    });

    if (stepIdx > 0) {
      const prevIdx = stepIdx - 1;
      const prevStep = state.steps[prevIdx];
      const prevStepOff = activeOffense(prevStep.off, state.playerCount);
      const prevCarrier = activeBallCarrier(prevStep, state.playerCount);
      const prevMatchups = prevIdx > 0
        ? getMatchupsAt(state.steps, prevIdx - 1, state.playerCount)
        : getMatchupsAt(state.steps, 0, state.playerCount);
      const prevPrevOff = prevIdx > 0
        ? activeOffense(state.steps[prevIdx - 1].off, state.playerCount)
        : prevStepOff;
      const prevStepStartPositions: DefenderPositions = prevIdx === 0
        ? buildStep0DetectionPositions(
            state,
            prevStepOff,
            prevCarrier,
            prevMatchups,
            activeDefenseInitial(state.defenseInitial, state.playerCount)
          )
        : extractDefenderPositions(computeDefenseTargets(state, prevIdx - 1, false).positions);
      const previousScreen = detectScreen(
        prevStepOff,
        prevCarrier,
        prevMatchups,
        prevStepStartPositions,
        state.screenRadius,
        prevStep.forcedScreener,
        prevPrevOff
      );
      if (previousScreen) {
        previousScreenQualityByDef[previousScreen.carrierDef] =
          findScreenQuality([prevStep, state.steps[prevIdx - 1]], previousScreen.screener);
      }
      const previousOffBallScreens = detectOffBallScreens(
        prevStepOff,
        prevCarrier,
        prevMatchups,
        prevStepStartPositions,
        state.screenRadius,
        prevPrevOff
      );
      previousOffBallScreens.forEach((s) => {
        previousScreenQualityByDef[s.cutterDef] = offBallScreenQuality(
          [prevStep, state.steps[prevIdx - 1]],
          s
        );
      });
    }
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
        screenPhase: targets[dId].screenPhase,
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

    // Anticipation IQ : pour le défenseur du porteur en recovery (juste
    // sorti d'un écran), on biaise la cible vers la trajectoire FUTURE
    // du porteur + l'axe ball-you-man (cf. anticipationTarget). Un
    // défenseur "intelligent" coupe la course au lieu de la rattraper.
    let smartTarget: Point = { x: rawTarget.x, y: rawTarget.y };
    const isRecoveringHint =
      stepIdx > 0 &&
      !targets[dId].onScreen &&
      rawTarget.isCarrierDefender &&
      previousScreenQualityByDef[dId] !== undefined;
    if (isRecoveringHint && rawTarget.matchedTo && offAtStep[rawTarget.matchedTo]) {
      const carrierNow = offAtStep[rawTarget.matchedTo];
      const carrierPrev = stepIdx > 0
        ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount)[rawTarget.matchedTo]
        : undefined;
      const carrierVel: Point = carrierPrev
        ? { x: carrierNow.x - carrierPrev.x, y: carrierNow.y - carrierPrev.y }
        : { x: 0, y: 0 };
      const iq = state.rules[dId]?.anticipation ?? 50;
      const distRule = state.rules[dId]?.distance ?? state.defenseDistance;
      const speedRule = state.rules[dId]?.maxSpeed ?? baseMaxSpeed;
      smartTarget = anticipationTarget(
        smartTarget,
        from,
        carrierNow,
        carrierVel,
        getDefenseHoop(state),
        distRule,
        speedRule,
        iq
      );
    }

    // Lever C — Pré-relaxation de la cible : si la cible idéale chevauche un
    // attaquant non-matché, on la repousse à l'écart. Évite que la contrainte
    // de vitesse compare une distance qui mène DANS un autre joueur.
    const nonMatchedAttackerPositions: Point[] = [];
    (Object.entries(offAtStep) as [AttackerId, Point][]).forEach(([oId, pos]) => {
      if (oId !== matched) nonMatchedAttackerPositions.push(pos);
    });
    const relaxed = pushOutOfMany(
      smartTarget,
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
    // Pénalité de contact d'écran : un défenseur qui prend un écran perd du
    // temps à se dégager. La pénalité est modulée par la
    // qualité de l'écran (Étape 12) :
    //   0   (ghost)    → ×1.00 (pas de contact)
    //   25  (loose)    → ×0.78
    //   50  (standard) → ×0.55 (défaut)
    //   75  (solid)    → ×0.32
    //   100 (lockdown) → ×0.18
    const isScreenedThisStep = targets[dId].screenPhase === 'impact';
    const isRecoveringFromScreen =
      !isScreenedThisStep &&
      prevTargets?.[dId]?.screenPhase === 'impact' &&
      previousScreenQualityByDef[dId] !== undefined;
    const screenContactPenalty = isScreenedThisStep
      ? screenPenaltyFromQuality(currentScreenQualityByDef[dId] ?? 50)
      : isRecoveringFromScreen
        ? screenPenaltyFromQuality(previousScreenQualityByDef[dId] ?? 50)
      : 1.0;
    const screenPhase = isScreenedThisStep
      ? 'impact'
      : isRecoveringFromScreen
        ? 'recover'
        : targets[dId].screenPhase;
    // Vitesse effective = vitesse théorique × friction × pénalité écran.
    const effectiveMaxSpeed = maxSpeed * friction * screenContactPenalty;

    // À l'étape 0, les défenseurs SONT à leur position idéale (setup, pas
    // une transition). Le réalisme post-écran est encodé dans la CIBLE elle-
    // même (cf. applyScreenAdjustment, qui place D1 sur le poseur) — pas
    // besoin de clamper la vitesse au step 0.
    //
    // Cas du défenseur QUI ARRIVE sur un écran : sa cible est déjà sur le
    // poseur. Clamper la vitesse le ferait s'arrêter EN AVANT du poseur,
    // visuellement proche du porteur — l'inverse de l'effet désiré. On laisse
    // le défenseur atteindre sa cible "plaqué au poseur" ; la pénalité de
    // vitesse s'appliquera au STEP SUIVANT quand il devra recover.
    if (stepIdx === 0 || pathLen <= effectiveMaxSpeed || isScreenedThisStep) {
      out[dId] = {
        x: to.x,
        y: to.y,
        late: false,
        helpFactor: targets[dId].helpFactor,
        isCarrierDefender: targets[dId].isCarrierDefender,
        matchedTo: targets[dId].matchedTo,
        onScreen: targets[dId].onScreen,
        screenPhase,
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
        screenPhase,
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

function offBallScreenQuality(
  steps: Array<AppState['steps'][number] | undefined>,
  screen: DetectedOffBallScreen
): number {
  const primary = findScreenQuality(steps, screen.screener);
  if (!screen.secondScreener) return primary;
  return Math.max(primary, findScreenQuality(steps, screen.secondScreener));
}
