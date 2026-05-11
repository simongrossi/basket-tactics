// Couche 1 — cibles défensives "base" : pour chaque défenseur, calcule la
// position idéale homme-à-homme (vsCarrier ou stance hors-ballon), applique
// le bias d'aide (sag uniquement), l'ajustement écran porteur (drop / over /
// under / chase / blitz / hedge), l'offset manuel d'orientation, puis
// l'orientation initiale (corps + regard + 2 cibles bras).
//
// C'est la première couche du calcul de cibles défensives. Elle initialise
// `positions` avec un slot par défenseur (matchups appliqués). Les couches
// suivantes (PnR, off-ball screens, trap, directives) overrident ces
// positions sans les recalculer depuis zéro.

import type {
  AttackerId,
  DefenderId,
  HelpPriority,
  Matchups,
  Point,
} from '../../types';
import { DEFAULT_DENY_AGGRESSIVENESS } from '../../data/physics';
import { computeHelpTarget, leaveAttackerCostMultiplier } from '../help';
import { applyScreenAdjustment } from '../screens';
import { computeDefenderOrientation } from '../orientation';
import {
  carrierDefenderTarget,
  manTarget,
  offBallStanceTarget,
  orientationLateralOffset,
} from '../manDefense';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';

export function applyBaseTargetsLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const {
    state, off, ballCarrier, defenderIds, hoop, triggers, side, screen,
    effectiveScreenRule, switchedThisStep, carrierPos, step,
  } = ctx;

  // Qualité de l'écran en cours, lue depuis l'annotation `screen` du step
  // si elle existe (sinon 50 par défaut). Module à quel point D1 est
  // "plaqué au poseur" via applyScreenAdjustment.
  let screenQuality = 50;
  if (screen) {
    const sa = step.annotations.find(
      (a) => a.type === 'screen' && a.fromId === screen.screener,
    );
    if (sa) screenQuality = sa.quality ?? 50;
  }

  defenderIds.forEach((dId) => {
    const oId = matchups[dId];
    const att = off[oId];
    const isCarrierDefender = oId === ballCarrier;
    const rule = state.rules[dId];
    if (!att || !rule) return;

    let target: Point;
    let helpFactor = 0;
    let denying = false;
    let helpTriggered = false;
    let helpAim: Point | undefined;
    let helpPriority: HelpPriority | undefined;
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
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth, hoop, screenQuality);
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
      matchedTo: oId as AttackerId,
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
}
