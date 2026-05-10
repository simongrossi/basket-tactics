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
import { detectTriggers } from './triggers';
import { manTarget, carrierDefenderTarget, offBallStanceTarget, orientationLateralOffset } from './manDefense';
import { computeDefenderOrientation } from './orientation';
import { DEFAULT_DENY_AGGRESSIVENESS } from '../data/physics';
import { computeHelpTarget, leaveAttackerCostMultiplier } from './help';
import {
  detectScreen,
  applyScreenAdjustment,
  applySwitch,
  detectOffBallScreens,
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
  peelSwitchShouldFire,
} from './screens';
import { computeZoneDefenseTargets } from './defense/zoneTargets';
import { detectScreenAction } from './screenAction';
import { computePnRRotations } from './pnrRotations';
import { ballSide } from './geometry';
import { HOOP, HOOP_OPPOSITE } from '../data/court';
import type { Point } from '../types';
import { isInTrapZone, pickTrapHelper, trapTarget } from './trap';
import { applyDirective } from './applyDirective';
import {
  activeBallCarrier,
  activeDefenseInitial,
  activeMatchups,
  activeOffense,
  getActiveDefenderIds,
} from './players';

/** Panier de référence côté défense pour cet AppState (selon attackingDirection). */
export function getDefenseHoop(state: AppState): Point {
  return state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
}

/**
 * Calcule les matchups en vigueur AU DÉBUT d'une étape donnée
 * en cumulant tous les switches survenus dans les étapes précédentes.
 */
export function getMatchupsAt(steps: Step[], stepIdx: number, playerCount: AppState['playerCount'] = 5): Matchups {
  let m: Matchups = activeMatchups(playerCount);
  const activeDefenders = new Set(getActiveDefenderIds(playerCount));
  for (let i = 0; i <= stepIdx; i++) {
    const sw = steps[i].switches || [];
    sw.forEach(([d1, d2]) => {
      if (!activeDefenders.has(d1) || !activeDefenders.has(d2)) return;
      const o1 = m[d1];
      const o2 = m[d2];
      if (!o1 || !o2) return;
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
  const off = activeOffense(cur.off, state.playerCount);
  const ballCarrier = activeBallCarrier(cur, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);

  // Matchups en début d'étape (avant détection d'écran sur cette étape)
  let matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);

  // Estimation des positions défensives au début de cette étape
  // pour que la détection d'écran soit basée sur où sont vraiment les défenseurs.
  const prevDefenderPositions: DefenderPositions =
    stepIdx === 0
      ? activeDefenseInitial(state.defenseInitial, state.playerCount)
      : extractDefenderPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);

  const prevOffAtStep: AttackerPositions | undefined =
    stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : undefined;
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

  const prevOff = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : null;
  const hoop = getDefenseHoop(state);
  const triggers = detectTriggers(off, prevOff, ballCarrier, state.triggers, hoop);
  const side = ballSide(off[ballCarrier]);
  const carrierPos = off[ballCarrier];

  const positions = {} as ReturnType<typeof computeDefenseTargets>['positions'];

  defenderIds.forEach((dId) => {
    const oId = matchups[dId];
    const att = off[oId];
    const isCarrierDefender = oId === ballCarrier;
    const rule = state.rules[dId];
    if (!att || !rule) return;

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
    // asymétriques) avec invariants anatomiques : regard ∈ ±60° du corps,
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
      bodyMode: rule.bodyOrientationMode,
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
    const prevOff = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : null;
    const prevPrevOff = stepIdx > 1 ? activeOffense(state.steps[stepIdx - 2].off, state.playerCount) : null;
    const action = detectScreenAction(off, prevOff, screen, null, prevPrevOff, hoop);
    const currentTargets = {} as Record<DefenderId, Point>;
    defenderIds.forEach((dId) => {
      currentTargets[dId] = { x: positions[dId].x, y: positions[dId].y };
    });
    const overrides = computePnRRotations(
      off, matchups, screen, action, currentTargets, hoop, activeDefenseInitial(state.defenseInitial, state.playerCount)
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
    defenderIds.forEach((dId) => {
      directiveTargets[dId] = { x: positions[dId].x, y: positions[dId].y };
    });
    const activeDefenders = new Set(defenderIds);
    const activeStep: Step = { ...cur, off, ballCarrier };
    for (const directive of cur.defensiveDirectives) {
      const activeDirective = {
        ...directive,
        defenders: directive.defenders.filter((dId) => activeDefenders.has(dId)),
        swapWith: directive.swapWith && activeDefenders.has(directive.swapWith)
          ? directive.swapWith
          : undefined,
      };
      if (activeDirective.defenders.length === 0) continue;
      applyDirective(directiveTargets, activeDirective, activeStep);
    }
    // Re-projette les nouvelles positions sur le record `positions` (arrondi).
    defenderIds.forEach((dId) => {
      positions[dId].x = Math.round(directiveTargets[dId].x);
      positions[dId].y = Math.round(directiveTargets[dId].y);
    });
  }

  // Post-pass orientation : après tous les ajustements (PnR, off-ball,
  // trap, switch), on recalcule orientation/facing en partant de la position
  // FINALE et du pnrRole effectif. Sinon, le low-man tag pointerait encore
  // vers son homme original au lieu de la zone de menace.
  defenderIds.forEach((dId) => {
    const slot = positions[dId];
    if (!slot) return;
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
      bodyMode: rule.bodyOrientationMode,
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

// `computeZoneDefenseTargets` extrait dans `./defense/zoneTargets.ts`.

// `computeAttackerVisuals` a été extrait dans `./attackerVisuals.ts`.
// Ré-export pour ne pas casser les imports historiques (CourtView, StepThumbnail,
// frameResolver pointent encore vers `./engine`).
export { computeAttackerVisuals } from './attackerVisuals';

/** Réduit un record de cibles défensives riches en plain `DefenderPositions`
 *  (juste x/y). Helper partagé entre engine.ts et attackerVisuals.ts. */
export function extractDefenderPositions(
  positions: Record<DefenderId, { x: number; y: number }>
): DefenderPositions {
  const out = {} as DefenderPositions;
  (Object.entries(positions) as [DefenderId, { x: number; y: number }][]).forEach(([id, p]) => {
    if (p) out[id] = { x: p.x, y: p.y };
  });
  return out;
}

// `detectStepScreenAction` extrait dans `./events/triggerDetector.ts`.
// Ré-export pour préserver l'API consommée par tacticalReads, coachDiagnostics
// et app/page.tsx.
export { detectStepScreenAction } from './events/triggerDetector';

// `effectiveDefensePositions` extrait dans `./defense/speedConstraint.ts`.
// Ré-export pour préserver l'API publique consommée par CourtView, frameResolver,
// app/page.tsx, coachDiagnostics, etc.
export { effectiveDefensePositions } from './defense/speedConstraint';

// `followDefendersAtFrame` et `recomputeDefenseFrameOrientations` extraits dans
// `./defense/frameAdjust.ts`. Ré-export pour préserver l'API publique consommée
// par CourtView, frameResolver, etc.
export { followDefendersAtFrame, recomputeDefenseFrameOrientations } from './defense/frameAdjust';
