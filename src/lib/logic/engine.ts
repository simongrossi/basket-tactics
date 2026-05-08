import type {
  AppState,
  ComputedDefense,
  DefenderId,
  DefenderPositions,
  Matchups,
  Step,
  AttackerId,
} from '../types';
import { baseMatchups } from '../data/initial';
import { getZoneLayout, mirrorZoneLayout, applyZoneOverrides } from '../data/zones';
import { detectTriggers } from './triggers';
import { manTarget, carrierDefenderTarget, offBallStanceTarget, orientationLateralOffset } from './manDefense';
import { computeHelpTarget, leaveAttackerCostMultiplier, closeoutProfileBonus } from './help';
import {
  detectScreen,
  applyScreenAdjustment,
  applySwitch,
  detectOffBallScreens,
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
} from './screens';
import { computeZoneTargets } from './zoneDefense';
import { detectScreenAction, type DetectedScreenAction } from './screenAction';
import {
  ballSide,
  distance,
  resolvePlayerCollisions,
  pathArcLength,
  proximityFriction,
  pickBlockingCluster,
  makeCluster,
  pushOutOfMany,
} from './geometry';
import { HOOP, HOOP_OPPOSITE, PLAYER_RADIUS } from '../data/court';
import type { Point } from '../types';
import { isInTrapZone, pickTrapHelper, trapTarget } from './trap';

/** Panier de référence côté défense pour cet AppState (selon attackingDirection). */
export function getDefenseHoop(state: AppState): Point {
  return state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
}

const DEFENDER_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

/** Facteur par défaut (utilisé si `state.closeoutBoost` est absent) : le
 *  défenseur du nouveau porteur accélère pour fermer la distance avant
 *  tir/drive. Tunable via `state.closeoutBoost`. */
const DEFAULT_CLOSEOUT_SPEED_FACTOR = 1.4;

/**
 * Calcule les matchups en vigueur AU DÉBUT d'une étape donnée
 * en cumulant tous les switches survenus dans les étapes précédentes.
 */
export function getMatchupsAt(steps: Step[], stepIdx: number): Matchups {
  let m: Matchups = { ...baseMatchups };
  for (let i = 0; i <= stepIdx; i++) {
    const sw = steps[i].switches || [];
    sw.forEach(([d1, d2]) => {
      const o1 = m[d1];
      const o2 = m[d2];
      m[d1] = o2;
      m[d2] = o1;
    });
  }
  return m;
}

/**
 * Calcule les positions cibles "idéales" des défenseurs sur une étape donnée,
 * sans tenir compte de la contrainte de vitesse (pas de "retard").
 *
 * Cette fonction peut aussi MUTER l'étape pour y inscrire un switch détecté.
 * (effet de bord assumé pour la persistance des switches)
 */
export function computeDefenseTargets(
  state: AppState,
  stepIdx: number,
  mutateStepForSwitch: boolean = true
): { positions: Record<DefenderId, { x: number; y: number; helpFactor: number; isCarrierDefender: boolean; matchedTo: AttackerId; onScreen: boolean; switchedThisStep: boolean; denying?: boolean; helpTriggered?: boolean }>; matchupsApplied: Matchups } {
  if (state.defenseSystem === 'zone') {
    return computeZoneDefenseTargets(state, stepIdx);
  }

  const cur = state.steps[stepIdx];
  const off = cur.off;
  const ballCarrier = cur.ballCarrier;

  // Matchups en début d'étape (avant détection d'écran sur cette étape)
  let matchups = getMatchupsAt(state.steps, stepIdx - 1);

  // Estimation des positions défensives au début de cette étape
  // pour que la détection d'écran soit basée sur où sont vraiment les défenseurs.
  const prevDefenderPositions: DefenderPositions =
    stepIdx === 0
      ? structuredClone(state.defenseInitial)
      : extractPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);

  const screen = detectScreen(off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, cur.forcedScreener);

  // Règle effective : on regarde l'override individuel du défenseur du porteur,
  // sinon on retombe sur la règle globale.
  const effectiveScreenRule = (() => {
    if (!screen) return state.screenRule;
    const nav = state.rules[screen.carrierDef]?.screenNav;
    return nav && nav !== 'auto' ? nav : state.screenRule;
  })();

  let switchedThisStep = false;
  if (screen && effectiveScreenRule === 'switch') {
    matchups = applySwitch(matchups, screen);
    switchedThisStep = true;
    if (mutateStepForSwitch && !cur.switches) {
      cur.switches = [[screen.carrierDef, screen.screenerDef]];
    }
  }

  const prevOff = stepIdx > 0 ? state.steps[stepIdx - 1].off : null;
  const hoop = getDefenseHoop(state);
  const triggers = detectTriggers(off, prevOff, ballCarrier, state.triggers, hoop);
  const side = ballSide(off[ballCarrier]);
  const carrierPos = off[ballCarrier];

  const positions = {} as ReturnType<typeof computeDefenseTargets>['positions'];

  DEFENDER_IDS.forEach((dId) => {
    const oId = matchups[dId];
    const att = off[oId];
    const isCarrierDefender = oId === ballCarrier;
    const rule = state.rules[dId];

    let target: { x: number; y: number };
    let helpFactor = 0;
    let denying = false;
    let helpTriggered = false;

    // Override de distance individuel (rule.distance) > global
    const dist = rule.distance ?? state.defenseDistance;
    if (isCarrierDefender) {
      target = carrierDefenderTarget(rule.vsCarrier, att, dist, hoop) || state.defenseInitial[dId];
    } else {
      const stance = rule.offBallStance ?? 'sag';
      const stancePos =
        stance !== 'sag'
          ? offBallStanceTarget(att, carrierPos, dist, stance, hoop) || state.defenseInitial[dId]
          : manTarget(att, dist, hoop) || state.defenseInitial[dId];
      target = stancePos;
      // Le help bias n'est appliqué qu'avec la stance "sag" — les stances
      // dirigées (deny-3q, fronting, behind) sont des positions absolues.
      if (stance === 'sag' && att && carrierPos) {
        // Override par défenseur > global > défaut (0.45)
        const denyAggressiveness = rule.denyAggressiveness ?? state.denyAggressiveness ?? 0.45;
        // Coût tactique de quitter cet attaquant : on aide moins fort si on
        // marque un shooter, plus fort si on marque un non-shooter.
        const leaveMult = leaveAttackerCostMultiplier(state.attackerProfiles?.[oId]);
        const help = computeHelpTarget(
          stancePos, rule, triggers, carrierPos, att, side, off, hoop,
          denyAggressiveness, leaveMult
        );
        target = help.target;
        helpFactor = help.helpFactor;
        denying = !!help.denying;
        helpTriggered = !!help.triggered;
      }
    }

    if (screen && effectiveScreenRule !== 'switch') {
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth, hoop);
    }

    // Offset latéral selon l'orientation du défenseur (en degrés). Subtil,
    // max ~12px à ±90°. Pas appliqué si le défenseur est en aide active
    // (helpFactor >= 0.5) : sa position est déjà dictée par la cible d'aide.
    const orientation = rule.orientation ?? 0;
    if (orientation !== 0 && helpFactor < 0.5) {
      target = { x: target.x + orientationLateralOffset(orientation), y: target.y };
    }

    positions[dId] = {
      x: Math.round(target.x),
      y: Math.round(target.y),
      helpFactor,
      isCarrierDefender,
      matchedTo: oId,
      onScreen: !!(screen && (dId === screen.carrierDef || dId === screen.screenerDef)),
      switchedThisStep: switchedThisStep && !!(screen && (dId === screen.carrierDef || dId === screen.screenerDef)),
      denying: denying || undefined,
      helpTriggered: helpTriggered || undefined,
    };
  });

  const offBallScreens = detectOffBallScreens(off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius);
  for (const obs of offBallScreens) {
    if (state.offBallScreenRule === 'switch') {
      matchups = applySwitchOffBall(matchups, obs);
      positions[obs.cutterDef].matchedTo = matchups[obs.cutterDef];
      positions[obs.screenerDef].matchedTo = matchups[obs.screenerDef];
    } else {
      const cutterTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.cutterDef].x, y: positions[obs.cutterDef].y },
        obs, state.offBallScreenRule, obs.cutterDef, off
      );
      positions[obs.cutterDef].x = Math.round(cutterTarget.x);
      positions[obs.cutterDef].y = Math.round(cutterTarget.y);

      const screenerTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.screenerDef].x, y: positions[obs.screenerDef].y },
        obs, state.offBallScreenRule, obs.screenerDef, off
      );
      positions[obs.screenerDef].x = Math.round(screenerTarget.x);
      positions[obs.screenerDef].y = Math.round(screenerTarget.y);
    }
    positions[obs.cutterDef].onScreen = true;
    positions[obs.screenerDef].onScreen = true;
  }

  // Trap en corner : si le porteur est dans une zone de trappe et que le
  // trigger est actif, le défenseur le plus proche (hors carrierDef) vient
  // verrouiller le côté opposé pour fermer la cage.
  if (state.triggers.trap && screen === null && isInTrapZone(carrierPos, hoop)) {
    const carrierDef = (Object.entries(matchups) as [DefenderId, AttackerId][])
      .find(([, o]) => o === ballCarrier)?.[0];
    if (carrierDef) {
      const helper = pickTrapHelper(off, prevDefenderPositions, matchups, ballCarrier);
      if (helper) {
        const t = trapTarget(carrierPos, { x: positions[carrierDef].x, y: positions[carrierDef].y });
        positions[helper].x = Math.round(t.x);
        positions[helper].y = Math.round(t.y);
      }
    }
  }

  return { positions, matchupsApplied: matchups };
}

function computeZoneDefenseTargets(
  state: AppState,
  stepIdx: number
): { positions: Record<DefenderId, { x: number; y: number; helpFactor: number; isCarrierDefender: boolean; matchedTo: AttackerId; onScreen: boolean; switchedThisStep: boolean }>; matchupsApplied: Matchups } {
  const cur = state.steps[stepIdx];
  const hoop = getDefenseHoop(state);
  const baseLayout = getZoneLayout(state.zoneConfig.type, state.zoneConfig.verticalOffset ?? 0);
  // En mode attack 'down', miroite le layout autour de la médiane pour que
  // les zones soient devant le panier protégé (bas).
  const oriented = state.attackingDirection === 'down' ? mirrorZoneLayout(baseLayout) : baseLayout;
  // Applique les overrides utilisateur (homePos déplacés, radius, mode) après
  // l'orientation pour rester invariant au sens d'attaque.
  const layout = applyZoneOverrides(oriented, state.zoneOverrides);
  const zoneTargets = computeZoneTargets(
    cur.off, cur.ballCarrier, layout, state.zoneConfig, state.defenseDistance, hoop
  );

  const positions = {} as ReturnType<typeof computeDefenseTargets>['positions'];
  const matchups = {} as Matchups;

  DEFENDER_IDS.forEach((dId) => {
    const zt = zoneTargets[dId];
    const trackedAttacker = zt?.trackedAttacker || 'O1';
    matchups[dId] = trackedAttacker;
    positions[dId] = {
      x: zt?.x ?? state.defenseInitial[dId].x,
      y: zt?.y ?? state.defenseInitial[dId].y,
      helpFactor: 0,
      isCarrierDefender: trackedAttacker === cur.ballCarrier,
      matchedTo: trackedAttacker,
      onScreen: false,
      switchedThisStep: false,
    };
  });

  return { positions, matchupsApplied: matchups };
}

function extractPositions(
  positions: Record<DefenderId, { x: number; y: number }>
): DefenderPositions {
  return {
    D1: { x: positions.D1.x, y: positions.D1.y },
    D2: { x: positions.D2.x, y: positions.D2.y },
    D3: { x: positions.D3.x, y: positions.D3.y },
    D4: { x: positions.D4.x, y: positions.D4.y },
    D5: { x: positions.D5.x, y: positions.D5.y },
  };
}

/**
 * Détecte l'écran porteur ET le type d'action (roll/pop/slip/short-roll/ghost/
 * reject/snake/re-screen) pour une étape donnée. Retourne null si aucun écran
 * n'est détecté à cette étape.
 *
 * Glue qui rassemble : matchups courants, positions défensives précédentes
 * (pour `detectScreen`), écran de l'étape précédente (pour `re-screen`), et
 * positions attaquantes des deux étapes précédentes (pour `snake`).
 */
export function detectStepScreenAction(
  state: AppState,
  stepIdx: number
): { screen: import('../types').DetectedScreen; action: DetectedScreenAction } | null {
  if (state.defenseSystem !== 'man') return null;
  const cur = state.steps[stepIdx];
  if (!cur) return null;
  const matchups = getMatchupsAt(state.steps, stepIdx - 1);
  const prevDef =
    stepIdx === 0
      ? structuredClone(state.defenseInitial)
      : extractPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
  const screen = detectScreen(
    cur.off, cur.ballCarrier, matchups, prevDef, state.screenRadius, cur.forcedScreener
  );
  if (!screen) return null;
  const prevOff = stepIdx > 0 ? state.steps[stepIdx - 1].off : null;
  const prevPrevOff = stepIdx > 1 ? state.steps[stepIdx - 2].off : null;
  let prevScreen: import('../types').DetectedScreen | null = null;
  if (stepIdx > 0) {
    const prevStep = state.steps[stepIdx - 1];
    const prevMatchups = getMatchupsAt(state.steps, stepIdx - 2);
    const prevPrevDef =
      stepIdx === 1
        ? structuredClone(state.defenseInitial)
        : extractPositions(computeDefenseTargets(state, stepIdx - 2, false).positions);
    prevScreen = detectScreen(
      prevStep.off, prevStep.ballCarrier, prevMatchups, prevPrevDef, state.screenRadius, prevStep.forcedScreener
    );
  }
  const action = detectScreenAction(
    cur.off, prevOff, screen, prevScreen, prevPrevOff, getDefenseHoop(state)
  );
  return { screen, action };
}

/**
 * Calcule les positions effectives en appliquant la contrainte de vitesse max.
 * Si un défenseur ne peut atteindre sa cible, il est marqué "late" et reste
 * en chemin.
 */
export function effectiveDefensePositions(state: AppState, stepIdx: number): ComputedDefense {
  const { positions: targets } = computeDefenseTargets(state, stepIdx, true);

  const baseMaxSpeed = state.defenseSystem === 'zone'
    ? state.zoneConfig.rotationSpeed
    : state.defenseMaxSpeed;

  // Détection closeout : transition (stepIdx > 0) où le ballon a changé de mains
  // entre l'étape précédente et celle-ci, en défense individuelle uniquement.
  const isCloseoutTransition =
    stepIdx > 0 &&
    state.defenseSystem === 'man' &&
    state.steps[stepIdx - 1].ballCarrier !== state.steps[stepIdx].ballCarrier;

  // Over-closeout : closeout ET le nouveau porteur a driver vers le panier
  // entre N-1 et N (le défenseur arrivé trop fort se fait déborder).
  let isOverClosedTransition = false;
  if (isCloseoutTransition) {
    const newCarrier = state.steps[stepIdx].ballCarrier;
    const prevP = state.steps[stepIdx - 1].off[newCarrier];
    const curP = state.steps[stepIdx].off[newCarrier];
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
      const layout = state.attackingDirection === 'down' ? mirrorZoneLayout(baseLayout) : baseLayout;
      prevPositions = {} as DefenderPositions;
      layout.forEach((z) => { prevPositions[z.assignedTo] = { ...z.homePos }; });
    } else {
      prevPositions = structuredClone(state.defenseInitial);
    }
  } else {
    prevPositions = extractPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
  }

  const overrides = state.steps[stepIdx]?.defenseOverrides;
  const offAtStep = state.steps[stepIdx]?.off ?? {};

  // Construit les clusters d'écran à contourner (poseur + son défenseur, fusionnés
  // en une seule masse). Seulement en défense individuelle — la zone n'a pas de
  // détection d'écran formelle. Mirroite la logique de CourtView pour que la
  // physique du moteur et le rendu du scrub utilisent les MÊMES obstacles.
  const screenerObstacles: { center: Point; radius: number; defenderToSkip: DefenderId }[] = [];
  if (state.defenseSystem === 'man' && stepIdx > 0) {
    const cur = state.steps[stepIdx];
    const matchupsForScreen = getMatchupsAt(state.steps, stepIdx - 1);
    const screen = detectScreen(
      cur.off, cur.ballCarrier, matchupsForScreen, prevPositions, state.screenRadius, cur.forcedScreener
    );
    const offBallScreens = detectOffBallScreens(
      cur.off, cur.ballCarrier, matchupsForScreen, prevPositions, state.screenRadius
    );
    const linkDist = PLAYER_RADIUS * 4;
    const baseR = PLAYER_RADIUS + 4;
    if (screen) {
      const sPos = cur.off[screen.screener];
      const sDef = prevPositions[screen.screenerDef];
      const c = makeCluster(sPos, [sDef], linkDist, baseR);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: screen.screenerDef });
    }
    offBallScreens.forEach((s) => {
      const sPos = cur.off[s.screener];
      const sDef = prevPositions[s.screenerDef];
      const c = makeCluster(sPos, [sDef], linkDist, baseR);
      screenerObstacles.push({ center: c.center, radius: c.radius, defenderToSkip: s.screenerDef });
    });
  }

  const out = {} as ComputedDefense;
  DEFENDER_IDS.forEach((dId) => {
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
    const minClearance = PLAYER_RADIUS * 2 + 2;
    const relaxed = pushOutOfMany(
      { x: rawTarget.x, y: rawTarget.y },
      nonMatchedAttackerPositions,
      minClearance
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
    DEFENDER_IDS.forEach((other) => {
      if (other !== dId) frictionObstacles.push(prevPositions[other]);
    });
    const friction = proximityFriction(from, to, frictionObstacles);

    // Closeout : le défenseur du nouveau porteur bénéficie d'un bump de vitesse.
    const closingOut = isCloseoutTransition && targets[dId].isCarrierDefender;
    const overClosed = isOverClosedTransition && targets[dId].isCarrierDefender;
    // Override par défenseur > global > défaut, modulé par le profil offensif
    // du porteur sur lequel on closeoute (shooter → +15%, non-shooter → -15%).
    const ruleBoost = state.rules[dId]?.closeoutBoost;
    const carrierForCloseout = state.steps[stepIdx].ballCarrier;
    const profileBonus = closingOut
      ? closeoutProfileBonus(state.attackerProfiles?.[carrierForCloseout])
      : 1;
    const closeoutBoost = (ruleBoost ?? state.closeoutBoost ?? DEFAULT_CLOSEOUT_SPEED_FACTOR) * profileBonus;
    // Vitesse max individuelle (rule.maxSpeed) > globale (en zone, on garde la rotation)
    const indivMaxSpeed = state.defenseSystem === 'man'
      ? (state.rules[dId]?.maxSpeed ?? baseMaxSpeed)
      : baseMaxSpeed;
    const maxSpeed = closingOut ? indivMaxSpeed * closeoutBoost : indivMaxSpeed;
    // Vitesse effective = vitesse théorique × friction de proximité.
    const effectiveMaxSpeed = maxSpeed * friction;

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
      };
    }
  });

  // Solveur de collisions : aucun défenseur ne peut se superposer à un
  // autre joueur (sauf son matchedTo).
  resolvePlayerCollisions(out as unknown as Record<string, ComputedDefense[DefenderId]>, offAtStep, PLAYER_RADIUS * 2 + 2);
  // Re-arrondit après résolution
  DEFENDER_IDS.forEach((dId) => {
    out[dId].x = Math.round(out[dId].x);
    out[dId].y = Math.round(out[dId].y);
  });

  return out;
}
