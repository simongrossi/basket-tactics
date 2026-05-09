import type {
  AppState,
  ComputedDefense,
  DefenderId,
  DefenderPositions,
  Matchups,
  Step,
  AttackerId,
  AttackerPositions,
} from '../types';
import { baseMatchups } from '../data/initial';
import { getZoneLayout, mirrorZoneLayout, applyZoneOverrides } from '../data/zones';
import { detectTriggers } from './triggers';
import { manTarget, carrierDefenderTarget, offBallStanceTarget, orientationLateralOffset } from './manDefense';
import { computeDefenderOrientation, computeAttackerOrientation, type AttackerRole } from './orientation';
import { DEFAULT_CLOSEOUT_BOOST, DEFAULT_DENY_AGGRESSIVENESS, MIN_PLAYER_CLEARANCE_PX } from '../data/physics';
import { computeHelpTarget, leaveAttackerCostMultiplier, closeoutProfileBonus } from './help';
import {
  detectScreen,
  applyScreenAdjustment,
  applySwitch,
  detectOffBallScreens,
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
  peelSwitchShouldFire,
} from './screens';
import { computeZoneTargets } from './zoneDefense';
import { detectScreenAction, type DetectedScreenAction } from './screenAction';
import { computePnRRotations } from './pnrRotations';
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
import { applyDirective } from './applyDirective';

/** Panier de référence côté défense pour cet AppState (selon attackingDirection). */
export function getDefenseHoop(state: AppState): Point {
  return state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
}

const DEFENDER_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

// Facteur de closeout par défaut : centralisé dans data/physics.ts.
const DEFAULT_CLOSEOUT_SPEED_FACTOR = DEFAULT_CLOSEOUT_BOOST;

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
): { positions: Record<DefenderId, { x: number; y: number; helpFactor: number; isCarrierDefender: boolean; matchedTo: AttackerId; onScreen: boolean; switchedThisStep: boolean; denying?: boolean; helpTriggered?: boolean; pnrRole?: 'tag' | 'x-out' | 'stunt'; orientation: number; gazeOrientation: number; facing: { x: number; y: number }; armBallSide: { x: number; y: number }; armManSide: { x: number; y: number }; helpAim?: { x: number; y: number }; helpPriority?: import('../types').HelpPriority; helpKind?: 'sag-weakside' | 'denial-strongside' | 'active-help' | 'none' }>; matchupsApplied: Matchups } {
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

  const prevOffAtStep: AttackerPositions | undefined =
    stepIdx > 0 ? state.steps[stepIdx - 1].off : undefined;
  const screen = detectScreen(off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, cur.forcedScreener, prevOffAtStep);

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
  // PEEL-SWITCH : couverture commence en drop, mais si le porteur a dépassé
  // le défenseur du screener à cette étape, le switch se déclenche.
  if (screen && effectiveScreenRule === 'peel-switch' && !switchedThisStep) {
    const sDefPos = prevDefenderPositions[screen.screenerDef];
    if (sDefPos && peelSwitchShouldFire(off, screen, sDefPos, getDefenseHoop(state))) {
      matchups = applySwitch(matchups, screen);
      switchedThisStep = true;
      if (mutateStepForSwitch && !cur.switches) {
        cur.switches = [[screen.carrierDef, screen.screenerDef]];
      }
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
    let helpAim: Point | undefined;
    let helpPriority: import('../types').HelpPriority | undefined;
    let helpKind: 'sag-weakside' | 'denial-strongside' | 'active-help' | 'none' | undefined;

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
        // Override par défenseur > global > défaut (cf. data/physics.ts).
        const denyAggressiveness = rule.denyAggressiveness ?? state.denyAggressiveness ?? DEFAULT_DENY_AGGRESSIVENESS;
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
        helpAim = help.aim;
        helpPriority = help.priority;
        helpKind = help.kind;
      }
    }

    if (screen && effectiveScreenRule !== 'switch') {
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth, hoop);
    }

    // Offset latéral selon le delta manuel d'orientation. Subtil, max ~12px
    // à ±45° (clamp en aval). Pas appliqué si le défenseur est en aide active
    // (helpFactor >= 0.5) : sa position est déjà dictée par la cible d'aide.
    const manualOrientationDelta = rule.orientation ?? 0;
    if (manualOrientationDelta !== 0 && helpFactor < 0.5) {
      target = { x: target.x + orientationLateralOffset(manualOrientationDelta), y: target.y };
    }

    // Calcul orientation Convention B (corps + regard + 2 cibles bras
    // asymétriques) avec invariants anatomiques : regard ∈ ±90° du corps,
    // bras jamais dans le dos. Le delta manuel (rule.orientation, ±45°) reste
    // pris en compte. Les overrides absolus (bodyOrientation/gazeOrientation)
    // priment quand définis.
    const orient = computeDefenderOrientation({
      defenderPos: target,
      manPos: att ?? target,
      ballPos: carrierPos,
      isCarrierDefender,
      stance: rule.offBallStance,
      vsCarrier: rule.vsCarrier,
      manualDelta: manualOrientationDelta,
      manualBody: rule.bodyOrientation,
      gazeLock: rule.gazeLock,
    });

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
      orientation: orient.bodyOrientation,
      gazeOrientation: orient.gazeOrientation,
      facing: orient.facing,
      armBallSide: orient.armBallSide,
      armManSide: orient.armManSide,
      helpAim,
      helpPriority,
      helpKind,
    };
  });

  // ---------------------------------------------------------------------
  // P1 — Rotations PnR : low-man tag + X-out + nail stunt.
  // S'applique seulement si un écran porteur est détecté ET que l'action
  // implique un mouvement vers le panier (roll / short-roll / slip). Pas
  // appliqué en cas de switch (matchups déjà inversés, défense déjà
  // recalibrée). Pas appliqué si défenseur a un override manuel — celui-ci
  // gagne dans effectiveDefensePositions.
  // ---------------------------------------------------------------------
  if (screen && effectiveScreenRule !== 'switch') {
    const prevOff = stepIdx > 0 ? state.steps[stepIdx - 1].off : null;
    const prevPrevOff = stepIdx > 1 ? state.steps[stepIdx - 2].off : null;
    const action = detectScreenAction(off, prevOff, screen, null, prevPrevOff, hoop);
    const currentTargets = {} as Record<DefenderId, Point>;
    DEFENDER_IDS.forEach((dId) => {
      currentTargets[dId] = { x: positions[dId].x, y: positions[dId].y };
    });
    const overrides = computePnRRotations(
      off, matchups, screen, action, currentTargets, hoop, state.defenseInitial
    );
    for (const ov of overrides) {
      positions[ov.defender].x = Math.round(ov.target.x);
      positions[ov.defender].y = Math.round(ov.target.y);
      positions[ov.defender].pnrRole = ov.role;
      // Marque comme aide active pour que HelpLines distingue ces rotations.
      if (ov.role === 'tag' || ov.role === 'x-out') {
        positions[ov.defender].helpFactor = Math.max(positions[ov.defender].helpFactor, 0.6);
        positions[ov.defender].helpTriggered = true;
      }
      // Pour le debug : aim de la rotation = la cible elle-même (le défenseur
      // se dirige vers ce point). On écrase l'éventuel aim d'aide standard
      // car la rotation PnR prend le pas.
      positions[ov.defender].helpAim = ov.target;
      positions[ov.defender].helpKind = 'active-help';
    }
  }

  const offBallScreens = detectOffBallScreens(off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, prevOffAtStep);
  for (const obs of offBallScreens) {
    if (state.offBallScreenRule === 'switch') {
      matchups = applySwitchOffBall(matchups, obs);
      positions[obs.cutterDef].matchedTo = matchups[obs.cutterDef];
      positions[obs.screenerDef].matchedTo = matchups[obs.screenerDef];
    } else {
      const cutterTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.cutterDef].x, y: positions[obs.cutterDef].y },
        obs, state.offBallScreenRule, obs.cutterDef, off, carrierPos
      );
      positions[obs.cutterDef].x = Math.round(cutterTarget.x);
      positions[obs.cutterDef].y = Math.round(cutterTarget.y);

      const screenerTarget = applyOffBallScreenAdjustment(
        { x: positions[obs.screenerDef].x, y: positions[obs.screenerDef].y },
        obs, state.offBallScreenRule, obs.screenerDef, off, carrierPos
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

  // Phase 3 — application des directives défensives scriptées
  // (step.defensiveDirectives) sur les positions cibles défensives finales.
  // Override additif : seuls les défenseurs nommés dans la directive sont
  // touchés. S'applique après tous les calculs standard (man/zone + écrans
  // + PnR + trap auto) pour permettre la prise de précédence par scénario.
  if (cur.defensiveDirectives && state.defenseScriptedDirectivesEnabled !== false) {
    const directiveTargets = {} as DefenderPositions;
    DEFENDER_IDS.forEach((dId) => {
      directiveTargets[dId] = { x: positions[dId].x, y: positions[dId].y };
    });
    for (const directive of cur.defensiveDirectives) {
      applyDirective(directiveTargets, directive, cur);
    }
    // Re-projette les nouvelles positions sur le record `positions` (arrondi).
    DEFENDER_IDS.forEach((dId) => {
      positions[dId].x = Math.round(directiveTargets[dId].x);
      positions[dId].y = Math.round(directiveTargets[dId].y);
    });
  }

  // Post-pass orientation : après tous les ajustements (PnR, off-ball,
  // trap, switch), on recalcule orientation/facing en partant de la position
  // FINALE et du pnrRole effectif. Sinon, le low-man tag pointerait encore
  // vers son homme original au lieu de la zone de menace.
  DEFENDER_IDS.forEach((dId) => {
    const slot = positions[dId];
    const att = off[slot.matchedTo];
    const rule = state.rules[dId];
    const recomputed = computeDefenderOrientation({
      defenderPos: { x: slot.x, y: slot.y },
      manPos: att ?? { x: slot.x, y: slot.y },
      ballPos: carrierPos,
      isCarrierDefender: slot.isCarrierDefender,
      stance: rule.offBallStance,
      vsCarrier: rule.vsCarrier,
      pnrRole: slot.pnrRole,
      manualDelta: rule.orientation ?? 0,
      manualBody: rule.bodyOrientation,
      gazeLock: rule.gazeLock,
    });
    slot.orientation = recomputed.bodyOrientation;
    slot.gazeOrientation = recomputed.gazeOrientation;
    slot.facing = recomputed.facing;
    slot.armBallSide = recomputed.armBallSide;
    slot.armManSide = recomputed.armManSide;
  });

  return { positions, matchupsApplied: matchups };
}

function computeZoneDefenseTargets(
  state: AppState,
  stepIdx: number
): { positions: Record<DefenderId, { x: number; y: number; helpFactor: number; isCarrierDefender: boolean; matchedTo: AttackerId; onScreen: boolean; switchedThisStep: boolean; orientation: number; gazeOrientation: number; facing: { x: number; y: number }; armBallSide: { x: number; y: number }; armManSide: { x: number; y: number }; helpAim?: { x: number; y: number }; helpPriority?: import('../types').HelpPriority; helpKind?: 'sag-weakside' | 'denial-strongside' | 'active-help' | 'none' }>; matchupsApplied: Matchups } {
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

  const carrierPosZone = cur.off[cur.ballCarrier];
  DEFENDER_IDS.forEach((dId) => {
    const zt = zoneTargets[dId];
    const trackedAttacker = zt?.trackedAttacker || 'O1';
    matchups[dId] = trackedAttacker;
    const x = zt?.x ?? state.defenseInitial[dId].x;
    const y = zt?.y ?? state.defenseInitial[dId].y;
    const att = cur.off[trackedAttacker];
    // En zone, tout le monde regarde le ballon (principe de base) ; le
    // tracking d'un attaquant est secondaire. On reflète ça via stance="sag"
    // (head-on-swivel) qui produit facing = midpoint(homme, ballon), ce qui
    // est en pratique très proche du ballon quand le défenseur n'est pas
    // collé à un homme.
    const orient = computeDefenderOrientation({
      defenderPos: { x, y },
      manPos: att ?? { x, y },
      ballPos: carrierPosZone ?? { x, y },
      isCarrierDefender: trackedAttacker === cur.ballCarrier,
      stance: 'sag',
      manualDelta: state.rules[dId]?.orientation ?? 0,
      manualBody: state.rules[dId]?.bodyOrientation,
      gazeLock: state.rules[dId]?.gazeLock,
    });
    positions[dId] = {
      x,
      y,
      helpFactor: 0,
      isCarrierDefender: trackedAttacker === cur.ballCarrier,
      matchedTo: trackedAttacker,
      onScreen: false,
      switchedThisStep: false,
      orientation: orient.bodyOrientation,
      gazeOrientation: orient.gazeOrientation,
      facing: orient.facing,
      armBallSide: orient.armBallSide,
      armManSide: orient.armManSide,
    };
  });

  return { positions, matchupsApplied: matchups };
}

/**
 * Calcule orientation + facing pour chaque attaquant à une étape donnée.
 *
 * Les rôles sont déduits du contexte :
 *  - `carrier` : le porteur de balle.
 *  - `passer` : à la transition stepIdx-1 → stepIdx, l'ex-porteur (s'il y a
 *    eu changement de carrier) regarde le NOUVEAU porteur (receveur). À cette
 *    étape, c'est lui le "passer" si le ballon était sur lui à l'étape
 *    précédente.
 *  - `cutter` : un non-porteur dont le delta vers l'étape SUIVANTE est > 30 px
 *    (il s'apprête à bouger, son orientation suit la course).
 *  - `screener` : si un écran est détecté (porteur ou off-ball), le poseur
 *    s'oriente perpendiculairement à la ligne screener→défenseur ciblé.
 *  - `idle` : aucun rôle particulier → regarde le ballon.
 */
export function computeAttackerVisuals(
  state: AppState,
  stepIdx: number
): import('../types').ComputedAttackerVisuals {
  const cur = state.steps[stepIdx];
  if (!cur) return {} as import('../types').ComputedAttackerVisuals;
  const off = cur.off;
  const ballPos = off[cur.ballCarrier];
  const hoop = getDefenseHoop(state);
  const next = state.steps[stepIdx + 1];
  const prev = state.steps[stepIdx - 1];

  // Détection écran porteur + off-ball pour les rôles screener (man uniquement).
  let detectedScreener: AttackerId | null = null;
  let screenerTargetDef: { x: number; y: number } | null = null;
  const offBallScreeners = new Map<AttackerId, { x: number; y: number }>();
  if (state.defenseSystem === 'man') {
    const matchups = getMatchupsAt(state.steps, stepIdx - 1);
    const prevDef =
      stepIdx === 0
        ? structuredClone(state.defenseInitial)
        : extractPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
    const prevOffArg = stepIdx > 0 ? state.steps[stepIdx - 1].off : undefined;
    const sc = detectScreen(off, cur.ballCarrier, matchups, prevDef, state.screenRadius, cur.forcedScreener, prevOffArg);
    if (sc) {
      detectedScreener = sc.screener;
      screenerTargetDef = prevDef[sc.carrierDef];
    }
    const obs = detectOffBallScreens(off, cur.ballCarrier, matchups, prevDef, state.screenRadius, prevOffArg);
    obs.forEach((o) => {
      offBallScreeners.set(o.screener, prevDef[o.cutterDef]);
    });
  }

  const out: import('../types').ComputedAttackerVisuals = {} as import('../types').ComputedAttackerVisuals;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    const attackerPos = off[id];
    let role: AttackerRole = 'idle';
    let receiverPos: Point | undefined;
    let nextPos: Point | undefined;
    let screenTargetDefPos: Point | undefined;

    if (id === cur.ballCarrier) {
      role = 'carrier';
    } else if (prev && prev.ballCarrier === id && cur.ballCarrier !== id) {
      // L'ex-porteur regarde le receveur (transition de balle).
      role = 'passer';
      receiverPos = off[cur.ballCarrier];
    } else if (id === detectedScreener && screenerTargetDef) {
      role = 'screener';
      screenTargetDefPos = screenerTargetDef;
    } else if (offBallScreeners.has(id)) {
      role = 'screener';
      screenTargetDefPos = offBallScreeners.get(id)!;
    } else if (next) {
      const np = next.off[id];
      if (np) {
        const dx = np.x - attackerPos.x;
        const dy = np.y - attackerPos.y;
        if (Math.hypot(dx, dy) > 30) {
          role = 'cutter';
          nextPos = np;
        }
      }
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
      // Détection dribble pour le porteur (cf. règle métier dans
      // orientation.ts : porteur statique → panier ; en dribble → mouvement).
      prevPos: prev ? prev.off[id] : undefined,
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
  const prevOff = stepIdx > 0 ? state.steps[stepIdx - 1].off : null;
  const prevPrevOff = stepIdx > 1 ? state.steps[stepIdx - 2].off : null;
  const screen = detectScreen(
    cur.off, cur.ballCarrier, matchups, prevDef, state.screenRadius, cur.forcedScreener, prevOff ?? undefined
  );
  if (!screen) return null;
  let prevScreen: import('../types').DetectedScreen | null = null;
  if (stepIdx > 0) {
    const prevStep = state.steps[stepIdx - 1];
    const prevMatchups = getMatchupsAt(state.steps, stepIdx - 2);
    const prevPrevDef =
      stepIdx === 1
        ? structuredClone(state.defenseInitial)
        : extractPositions(computeDefenseTargets(state, stepIdx - 2, false).positions);
    prevScreen = detectScreen(
      prevStep.off, prevStep.ballCarrier, prevMatchups, prevPrevDef, state.screenRadius, prevStep.forcedScreener,
      prevPrevOff ?? undefined
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
    const prevOffEff = state.steps[stepIdx - 1].off;
    const screen = detectScreen(
      cur.off, cur.ballCarrier, matchupsForScreen, prevPositions, state.screenRadius, cur.forcedScreener, prevOffEff
    );
    const offBallScreens = detectOffBallScreens(
      cur.off, cur.ballCarrier, matchupsForScreen, prevPositions, state.screenRadius, prevOffEff
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
    const minClearance = MIN_PLAYER_CLEARANCE_PX;
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
  DEFENDER_IDS.forEach((dId) => {
    out[dId].x = Math.round(out[dId].x);
    out[dId].y = Math.round(out[dId].y);
  });

  return out;
}
