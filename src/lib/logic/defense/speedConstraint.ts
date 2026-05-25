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
import { buildStep0DetectionPositions } from '../step0Detection';
import { getZoneLayout, mirrorZoneLayout } from '../../data/zones';
import { DEFAULT_CLOSEOUT_BOOST, MIN_PLAYER_CLEARANCE_PX } from '../../data/physics';
import { closeoutProfileBonus } from '../help';
import {
  pathAroundScreensLength,
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
  screenPenaltyFromQuality,
} from '../screenPhysics';
import {
  appendStepScreenObstacles,
  detectScreenContext,
  screenQualityByDef,
  type ScreenObstacle,
} from '../screenContext';
import {
  computeDefensiveRoute,
  sampleRoute,
  type RouteObstacle,
  type DefensiveRoute,
} from '../defensiveRoute';
import { angleDiff, angleFromNorth } from '../angles';


export { screenPenaltyFromQuality } from '../screenPhysics';

interface EffectiveDefenseCacheDeps {
  steps: AppState['steps'];
  step: AppState['steps'][number] | undefined;
  prevStep: AppState['steps'][number] | undefined;
  defenseInitial: AppState['defenseInitial'];
  rules: AppState['rules'];
  triggers: AppState['triggers'];
  zoneConfig: AppState['zoneConfig'];
  zoneOverrides: AppState['zoneOverrides'];
  scriptedActions: AppState['scriptedActions'];
  attackerProfiles: AppState['attackerProfiles'];
  defenseSystem: AppState['defenseSystem'];
  playerCount: AppState['playerCount'];
  defenseDistance: AppState['defenseDistance'];
  defenseMaxSpeed: AppState['defenseMaxSpeed'];
  screenRule: AppState['screenRule'];
  screenRadius: AppState['screenRadius'];
  dropDepth: AppState['dropDepth'];
  offBallScreenRule: AppState['offBallScreenRule'];
  closeoutBoost: AppState['closeoutBoost'];
  denyAggressiveness: AppState['denyAggressiveness'];
  attackingDirection: AppState['attackingDirection'];
  defenseScriptedDirectivesEnabled: AppState['defenseScriptedDirectivesEnabled'];
  defensiveRouting: AppState['defensiveRouting'];
}

interface EffectiveDefenseCacheEntry {
  deps: EffectiveDefenseCacheDeps;
  value: ComputedDefense;
}

const effectiveDefenseCache = new WeakMap<AppState, Map<number, EffectiveDefenseCacheEntry>>();

function effectiveDefenseDeps(state: AppState, stepIdx: number): EffectiveDefenseCacheDeps {
  return {
    steps: state.steps,
    step: state.steps[stepIdx],
    prevStep: state.steps[stepIdx - 1],
    defenseInitial: state.defenseInitial,
    rules: state.rules,
    triggers: state.triggers,
    zoneConfig: state.zoneConfig,
    zoneOverrides: state.zoneOverrides,
    scriptedActions: state.scriptedActions,
    attackerProfiles: state.attackerProfiles,
    defenseSystem: state.defenseSystem,
    playerCount: state.playerCount,
    defenseDistance: state.defenseDistance,
    defenseMaxSpeed: state.defenseMaxSpeed,
    screenRule: state.screenRule,
    screenRadius: state.screenRadius,
    dropDepth: state.dropDepth,
    offBallScreenRule: state.offBallScreenRule,
    closeoutBoost: state.closeoutBoost,
    denyAggressiveness: state.denyAggressiveness,
    attackingDirection: state.attackingDirection,
    defenseScriptedDirectivesEnabled: state.defenseScriptedDirectivesEnabled,
    defensiveRouting: state.defensiveRouting,
  };
}

function sameEffectiveDefenseDeps(a: EffectiveDefenseCacheDeps, b: EffectiveDefenseCacheDeps): boolean {
  return Object.keys(a).every((key) => {
    const k = key as keyof EffectiveDefenseCacheDeps;
    return a[k] === b[k];
  });
}

/**
 * Calcule les positions effectives en appliquant la contrainte de vitesse max.
 * Si un défenseur ne peut atteindre sa cible, il est marqué "late" et reste
 * en chemin.
 */
export function effectiveDefensePositions(state: AppState, stepIdx: number): ComputedDefense {
  const deps = effectiveDefenseDeps(state, stepIdx);
  let stateCache = effectiveDefenseCache.get(state);
  if (!stateCache) {
    stateCache = new Map();
    effectiveDefenseCache.set(state, stateCache);
  }
  const cached = stateCache.get(stepIdx);
  if (cached && sameEffectiveDefenseDeps(cached.deps, deps)) {
    return cached.value;
  }
  const value = computeEffectiveDefensePositions(state, stepIdx);
  stateCache.set(stepIdx, { deps, value });
  return value;
}

function computeEffectiveDefensePositions(state: AppState, stepIdx: number): ComputedDefense {
  const { positions: targets } = computeDefenseTargets(state, stepIdx);
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
  let prevComputed: ComputedDefense | null = null;
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
    if (state.footworkRulesEnabled) {
      prevComputed = effectiveDefensePositions(state, stepIdx - 1);
      prevPositions = {} as DefenderPositions;
      for (const dId of defenderIds) {
        prevPositions[dId] = { x: prevComputed[dId].x, y: prevComputed[dId].y };
      }
    } else {
      prevPositions = extractDefenderPositions(prevTargets);
    }
  }

  // G.3 — V1 : modèle linéaire simple. Au step N (= stepIdx), la vitesse
  // effective du défenseur ne peut excéder `(N + 1) × accel`, plafonnée
  // par maxSpeed individuelle (cf. clamp plus bas). Cela modélise une
  // montée progressive depuis le repos sur les premiers steps.
  //
  // Approximation V1 : on suppose que tous les défenseurs partent au
  // repos au step 0. Pour des cas plus fins (vitesse continue à travers
  // un changement de direction, décélération), un V2 utilisera la vitesse
  // réelle step→step (post-clamp), ce qui nécessite un cache cross-step.
  // Au step N, le défenseur a eu N transitions pour accélérer depuis le
  // repos. À stepIdx=1 (= 1ère transition), budget = 1 × accel ; à stepIdx=2,
  // budget = 2 × accel ; etc. À stepIdx=0 (pas de clamp en aval), peu importe.
  const accelBudget = state.accelerationModelEnabled
    ? ((state.defenderAcceleration ?? 75) * Math.max(1, stepIdx))
    : Infinity;

  const overrides = state.steps[stepIdx]?.defenseOverrides;
  const offAtStep = activeOffense(state.steps[stepIdx]?.off ?? {} as AttackerPositions, state.playerCount);

  // Construit les clusters d'écran à contourner (poseur + son défenseur, fusionnés
  // en une seule masse). Seulement en défense individuelle — la zone n'a pas de
  // détection d'écran formelle. Mirroite la logique de CourtView pour que la
  // physique du moteur et le rendu du scrub utilisent les MÊMES obstacles.
  const screenerObstacles: ScreenObstacle[] = [];
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
    const ctx = detectScreenContext({
      off: curOff,
      carrier,
      matchups: matchupsForScreen,
      defenderPositions: detectionPositions,
      screenRadius: state.screenRadius,
      forcedScreener: cur.forcedScreener,
      prevOff: prevOffEff,
    });
    appendStepScreenObstacles(screenerObstacles, ctx, curOff, detectionPositions);
    Object.assign(
      currentScreenQualityByDef,
      screenQualityByDef(ctx, [state.steps[stepIdx], state.steps[stepIdx - 1]])
    );

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
      const previousCtx = detectScreenContext({
        off: prevStepOff,
        carrier: prevCarrier,
        matchups: prevMatchups,
        defenderPositions: prevStepStartPositions,
        screenRadius: state.screenRadius,
        forcedScreener: prevStep.forcedScreener,
        prevOff: prevPrevOff,
      });
      Object.assign(
        previousScreenQualityByDef,
        screenQualityByDef(previousCtx, [prevStep, state.steps[prevIdx - 1]])
      );
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
        mismatchSeverity: targets[dId].mismatchSeverity,
        scrammedThisStep: targets[dId].scrammedThisStep,
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
        isPassShadowed: targets[dId].isPassShadowed,
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
    let pathLen = pathAroundScreensLength(from, to, candidates);

    // D.4 V2 — Routage des cibles de step. Pour un défenseur éligible (défense
    // individuelle, hors contact d'écran, hors rotation PnR, hors closeout,
    // hors override — l'override est déjà traité en amont par un return), on
    // calcule un trajet qui contourne les obstacles NON-écran. La longueur de
    // route allonge `pathLen` (le défenseur paie le détour → devient `late`
    // plus tôt). S'il finit `late`, sa position de step suit la route (cf.
    // plus bas). Complémentaire du Lever A : Lever A route les écrans, V2 les
    // obstacles non-écran. Le filet dur `resolvePlayerCollisions` reste en aval.
    let routeForLate: DefensiveRoute | null = null;
    if (
      state.defensiveRouting &&
      state.defenseSystem === 'man' &&
      stepIdx > 0 &&
      !targets[dId].onScreen &&
      targets[dId].screenPhase !== 'impact' &&
      !targets[dId].pnrRole &&
      !(isCloseoutTransition && targets[dId].isCarrierDefender)
    ) {
      const routeObstacles: RouteObstacle[] = [];
      defenderIds.forEach((other) => {
        if (other !== dId) {
          routeObstacles.push({
            center: prevPositions[other],
            radius: MIN_PLAYER_CLEARANCE_PX,
          });
        }
      });
      nonMatchedAttackerPositions.forEach((pos) => {
        // Exclure les attaquants situés DANS un cluster d'écran (poseurs) :
        // les écrans sont gérés par le Lever A, V2 ne les route pas.
        const inScreenCluster = screenerObstacles.some(
          (o) => Math.hypot(o.center.x - pos.x, o.center.y - pos.y) < o.radius,
        );
        if (!inScreenCluster) {
          routeObstacles.push({ center: pos, radius: MIN_PLAYER_CLEARANCE_PX });
        }
      });
      const route = computeDefensiveRoute(from, to, routeObstacles);
      if (route.waypoints.length > 2) {
        routeForLate = route;
        // `pathLen` = le plus long des deux détours (écran vs non-écran).
        pathLen = Math.max(pathLen, route.length);
      }
    }

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
    // Vitesse max individuelle (rule.maxSpeed) > globale (en zone, on garde la rotation).
    // G.4 — modulation par profil athlétique du défenseur (elite ×1.3,
    // lent ×0.7, standard/undefined ×1.0).
    // G.2 — sprint boost contextuel (step.sprintBoost) ×1.8 pendant fast
    // break / transition / run-out.
    const rawIndivMaxSpeed = state.defenseSystem === 'man'
      ? (state.rules[dId]?.maxSpeed ?? baseMaxSpeed)
      : baseMaxSpeed;
    const speedProfile = state.defenderSpeedProfiles?.[dId];
    const profileMultiplier =
      speedProfile === 'elite' ? 1.3 :
      speedProfile === 'lent' ? 0.7 : 1.0;
    const sprintMultiplier = curStep.sprintBoost ? 1.8 : 1.0;
    const indivMaxSpeed = rawIndivMaxSpeed * profileMultiplier * sprintMultiplier;
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
    let screenContactPenalty = isScreenedThisStep
      ? screenPenaltyFromQuality(currentScreenQualityByDef[dId] ?? 50)
      : isRecoveringFromScreen
        ? screenPenaltyFromQuality(previousScreenQualityByDef[dId] ?? 50)
      : 1.0;
    // Stiffness & Impact (opt-in) — amplifie la pénalité d'écran existante
    // proportionnellement à `screenStiffness`. Préserve la cible D1 (le
    // pipeline d'écran reste intouché) ; seul l'effort de dégagement coûte
    // plus cher. À 1.0 = no-op. À 2.0 = pénalité doublée (impact "violent").
    // Borne basse 0.08 pour éviter la paralysie totale.
    if (state.screenStiffnessEnabled && (isScreenedThisStep || isRecoveringFromScreen)) {
      const stiffness = state.screenStiffness ?? 1.5;
      screenContactPenalty = Math.max(0.08, 1 - (1 - screenContactPenalty) * stiffness);
    }
    const screenPhase = isScreenedThisStep
      ? 'impact'
      : isRecoveringFromScreen
        ? 'recover'
        : targets[dId].screenPhase;
    // Vitesse effective = vitesse théorique × friction × pénalité écran.
    let effectiveMaxSpeed = maxSpeed * friction * screenContactPenalty;

    // Biomécanique, motricité et attention (Footwork)
    let delayFraction = 0;
    if (state.footworkRulesEnabled) {
      let latencyFraction = 0;
      if (stepIdx > 0 && prevComputed) {
        const matches = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
        const matchedDef = matches[dId];
        const prevStep = state.steps[stepIdx - 1];
        const hasPassTrigger = prevStep.annotations.some(ann => ann.type === 'pass');
        const hasCutTrigger = prevStep.annotations.some(ann => ann.type === 'cut' && ann.fromId === matchedDef);

        if (hasPassTrigger || hasCutTrigger) {
          const prevOff = activeOffense(prevStep.off, state.playerCount);
          const prevCarrier = activeBallCarrier(prevStep, state.playerCount);
          const ballPosPrev = prevOff[prevCarrier];
          const oppPosPrev = prevOff[matchedDef];
          const defenderPosPrev = prevPositions[dId];
          const prevGazeOrientation = prevComputed[dId].gazeOrientation;

          let isPassBlind = false;
          if (hasPassTrigger && ballPosPrev && defenderPosPrev) {
            const angleToBall = angleFromNorth(defenderPosPrev, ballPosPrev);
            isPassBlind = Math.abs(angleDiff(angleToBall, prevGazeOrientation)) > 60;
          }

          let isCutBlind = false;
          if (hasCutTrigger && oppPosPrev && defenderPosPrev) {
            const angleToOpp = angleFromNorth(defenderPosPrev, oppPosPrev);
            isCutBlind = Math.abs(angleDiff(angleToOpp, prevGazeOrientation)) > 60;
          }

          const passCond = !hasPassTrigger || isPassBlind;
          const cutCond = !hasCutTrigger || isCutBlind;
          if (passCond && cutCond) {
            const stepDurationSec = curStep.duration ?? state.secondsPerStep ?? 4;
            latencyFraction = Math.min(1.0, 0.2 / stepDurationSec);
          }
        }
      }

      let pivotFraction = 0;
      if (stepIdx >= 2 && prevComputed) {
        const prevPrevComputed = effectiveDefensePositions(state, stepIdx - 2);
        if (prevPrevComputed && prevPrevComputed[dId]) {
          const prevPrevPos = { x: prevPrevComputed[dId].x, y: prevPrevComputed[dId].y };
          const prevPos = { x: prevComputed[dId].x, y: prevComputed[dId].y };
          const prevMoveDist = Math.hypot(prevPos.x - prevPrevPos.x, prevPos.y - prevPrevPos.y);
          const curMoveDist = Math.hypot(to.x - prevPos.x, to.y - prevPos.y);
          if (prevMoveDist > 5 && curMoveDist > 5) {
            const prevMoveAngle = angleFromNorth(prevPrevPos, prevPos);
            const curMoveAngle = angleFromNorth(prevPos, to);
            const pivotDiff = Math.abs(angleDiff(curMoveAngle, prevMoveAngle));
            if (pivotDiff > 90) {
              const pivotDelaySec = 0.15 + 0.15 * ((pivotDiff - 90) / 90);
              const stepDurationSec = curStep.duration ?? state.secondsPerStep ?? 4;
              pivotFraction = Math.min(1.0, pivotDelaySec / stepDurationSec);
            }
          }
        }
      }

      delayFraction = Math.max(latencyFraction, pivotFraction);
      if (delayFraction > 0) {
        effectiveMaxSpeed *= (1.0 - delayFraction);
      }

      let speedMult = 1.0;
      if (stepIdx > 0) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.1) {
          const moveAngle = angleFromNorth(from, to);
          const prevOrientation = prevComputed ? prevComputed[dId].orientation : targets[dId].orientation;
          const diffDeg = Math.abs(angleDiff(moveAngle, prevOrientation));
          if (diffDeg <= 90) {
            speedMult = 1.0 - 0.25 * (diffDeg / 90);
          } else {
            speedMult = 0.75 - 0.15 * ((diffDeg - 90) / 90);
          }
        }
      }
      effectiveMaxSpeed *= speedMult;
    }

    // G.3 — Plafond par budget d'accélération (V1 linéaire depuis le repos).
    // Sans flag, accelBudget = Infinity → no-op.
    effectiveMaxSpeed = Math.min(effectiveMaxSpeed, accelBudget);

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
        mismatchSeverity: targets[dId].mismatchSeverity,
        scrammedThisStep: targets[dId].scrammedThisStep,
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
        isPassShadowed: targets[dId].isPassShadowed,
        delayFraction: state.footworkRulesEnabled ? delayFraction : undefined,
      };
    } else {
      const r = effectiveMaxSpeed / pathLen;
      // D.4 V2 — si une route de contournement existe, la position `late`
      // suit la route échantillonnée à `r`. NB : `r` est dérivé de `pathLen`
      // = max(arc d'écran, longueur de route). Quand l'arc d'écran domine,
      // `r` est plus petit que la fraction d'arc réelle de la route → le
      // défenseur est échantillonné EN-DEÇÀ de sa portée réelle sur la
      // route. C'est une approximation CONSERVATRICE assumée (le défenseur
      // ralenti par un écran tiers traîne), cohérente avec le scaling
      // rectiligne legacy qui dérive lui aussi son ratio de `pathLen`.
      const latePos = routeForLate
        ? sampleRoute(routeForLate, r)
        : { x: from.x + (to.x - from.x) * r, y: from.y + (to.y - from.y) * r };
      out[dId] = {
        // Pas d'arrondi : la position est consommée par interpolation
        // de frame qui dégrade la précision si on round ici. Conserver
        // les flottants pour une trajectoire continue.
        x: latePos.x,
        y: latePos.y,
        late: true,
        helpFactor: targets[dId].helpFactor,
        isCarrierDefender: targets[dId].isCarrierDefender,
        matchedTo: targets[dId].matchedTo,
        onScreen: targets[dId].onScreen,
        screenPhase,
        switchedThisStep: targets[dId].switchedThisStep,
        mismatchSeverity: targets[dId].mismatchSeverity,
        scrammedThisStep: targets[dId].scrammedThisStep,
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
        isPassShadowed: targets[dId].isPassShadowed,
        delayFraction: state.footworkRulesEnabled ? delayFraction : undefined,
      };
    }
  });

  // Solveur de collisions : aucun défenseur ne peut se superposer à un
  // autre joueur (sauf son matchedTo).
  resolvePlayerCollisions(out as unknown as Record<string, ComputedDefense[DefenderId]>, offAtStep, MIN_PLAYER_CLEARANCE_PX);
  // PAS d'arrondi ici : les positions sont consommées par l'interpolation
  // de frame qui lerp en sub-pixel. Arrondir ferait varier la position de
  // 0.5px d'une frame à l'autre → 30px d'erreur cumulée sur 60 frames.

  recomputeDefenseFrameOrientations(state, offAtStep, curCarrier, out, prevPositions);

  return out;
}
