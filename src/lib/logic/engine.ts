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
import { getZoneLayout } from '../data/zones';
import { detectTriggers } from './triggers';
import { manTarget, carrierDefenderTarget, offBallStanceTarget } from './manDefense';
import { computeHelpTarget } from './help';
import {
  detectScreen,
  applyScreenAdjustment,
  applySwitch,
  detectOffBallScreens,
  applyOffBallScreenAdjustment,
  applySwitchOffBall,
} from './screens';
import { computeZoneTargets } from './zoneDefense';
import { ballSide, distance } from './geometry';

const DEFENDER_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

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
): { positions: Record<DefenderId, { x: number; y: number; helpFactor: number; isCarrierDefender: boolean; matchedTo: AttackerId; onScreen: boolean; switchedThisStep: boolean }>; matchupsApplied: Matchups } {
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

  const screen = detectScreen(off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius);

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
  const triggers = detectTriggers(off, prevOff, ballCarrier, state.triggers);
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

    if (isCarrierDefender) {
      target = carrierDefenderTarget(rule.vsCarrier, att, state.defenseDistance) || state.defenseInitial[dId];
    } else {
      const stance = rule.offBallStance ?? 'sag';
      const stancePos =
        stance !== 'sag'
          ? offBallStanceTarget(att, carrierPos, state.defenseDistance, stance) || state.defenseInitial[dId]
          : manTarget(att, state.defenseDistance) || state.defenseInitial[dId];
      target = stancePos;
      // Le help bias n'est appliqué qu'avec la stance "sag" — les stances
      // dirigées (deny-3q, fronting, behind) sont des positions absolues.
      if (stance === 'sag' && att && carrierPos) {
        const help = computeHelpTarget(stancePos, rule, triggers, carrierPos, att, side, off);
        target = help.target;
        helpFactor = help.helpFactor;
      }
    }

    if (screen && effectiveScreenRule !== 'switch') {
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth);
    }

    positions[dId] = {
      x: Math.round(target.x),
      y: Math.round(target.y),
      helpFactor,
      isCarrierDefender,
      matchedTo: oId,
      onScreen: !!(screen && (dId === screen.carrierDef || dId === screen.screenerDef)),
      switchedThisStep: switchedThisStep && !!(screen && (dId === screen.carrierDef || dId === screen.screenerDef)),
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

  return { positions, matchupsApplied: matchups };
}

function computeZoneDefenseTargets(
  state: AppState,
  stepIdx: number
): { positions: Record<DefenderId, { x: number; y: number; helpFactor: number; isCarrierDefender: boolean; matchedTo: AttackerId; onScreen: boolean; switchedThisStep: boolean }>; matchupsApplied: Matchups } {
  const cur = state.steps[stepIdx];
  const layout = getZoneLayout(state.zoneConfig.type);
  const zoneTargets = computeZoneTargets(
    cur.off, cur.ballCarrier, layout, state.zoneConfig, state.defenseDistance
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
 * Calcule les positions effectives en appliquant la contrainte de vitesse max.
 * Si un défenseur ne peut atteindre sa cible, il est marqué "late" et reste
 * en chemin.
 */
export function effectiveDefensePositions(state: AppState, stepIdx: number): ComputedDefense {
  const { positions: targets } = computeDefenseTargets(state, stepIdx, true);

  const maxSpeed = state.defenseSystem === 'zone'
    ? state.zoneConfig.rotationSpeed
    : state.defenseMaxSpeed;

  let prevPositions: DefenderPositions;
  if (stepIdx === 0) {
    if (state.defenseSystem === 'zone') {
      const layout = getZoneLayout(state.zoneConfig.type);
      prevPositions = {} as DefenderPositions;
      layout.forEach((z) => { prevPositions[z.assignedTo] = { ...z.homePos }; });
    } else {
      prevPositions = structuredClone(state.defenseInitial);
    }
  } else {
    prevPositions = extractPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);
  }

  const overrides = state.steps[stepIdx]?.defenseOverrides;

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
      };
      return;
    }

    const from = prevPositions[dId];
    const to = targets[dId];
    const d = distance(from, to);

    // À l'étape 0, on considère que les défenseurs SONT à leur position idéale
    // (le step 0 est un setup, pas une transition). La contrainte de vitesse
    // ne s'applique qu'entre les étapes suivantes.
    if (stepIdx === 0 || d <= maxSpeed) {
      out[dId] = { ...to, late: false };
    } else {
      const r = maxSpeed / d;
      out[dId] = {
        x: Math.round(from.x + (to.x - from.x) * r),
        y: Math.round(from.y + (to.y - from.y) * r),
        late: true,
        helpFactor: targets[dId].helpFactor,
        isCarrierDefender: targets[dId].isCarrierDefender,
        matchedTo: targets[dId].matchedTo,
        onScreen: targets[dId].onScreen,
        switchedThisStep: targets[dId].switchedThisStep,
      };
    }
  });

  return out;
}
