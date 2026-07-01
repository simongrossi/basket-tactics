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
import { DEFAULT_DENY_AGGRESSIVENESS, STEERING_MAN_SLOWING_RADIUS_PX } from '../../data/physics';
import { computeHelpForces, computeHelpTarget, leaveAttackerCostMultiplier } from '../help';
import { detectEarlyDrive } from '../triggers';
import { applyScreenAdjustment, detectImminentScreen } from '../screens';
import { computeDefenderOrientation } from '../orientation';
import {
  carrierDefenderTarget,
  carrierDefenderTargetForces,
  manTarget,
  manTargetForces,
  offBallStanceTarget,
  offBallStanceTargetForces,
  orientationLateralOffset,
} from '../manDefense';
import { composeTarget } from '../steeringEngine';
import { passShadowsByDefender, scaledProfileMultipliers } from '../defenseTriangle';
import type { DefenseFrameContext } from './context';
import type { DefenderTarget } from './types';
import { mismatchSeverity } from './mismatchTracking';

export function applyBaseTargetsLayer(
  positions: Record<DefenderId, DefenderTarget>,
  matchups: Matchups,
  ctx: DefenseFrameContext
): void {
  const {
    state, off, ballCarrier, defenderIds, hoop, triggers, side, screen,
    effectiveScreenRule, switchedThisStep, carrierPos, step, scrammedSwitch,
    snakeDribble, prevOff, prevDefenderPositions,
  } = ctx;

  // C.4 — Pre-rotation : si aucun écran porteur n'est encore détecté MAIS
  // qu'un attaquant approche du défenseur du porteur (en mouvement, dans la
  // zone proche), on calcule un imminent. Le défenseur du porteur sera
  // ensuite shifté de ~10 px vers le screener attendu (épaule tournée).
  // Désactivé par défaut (`state.preRotationEnabled`).
  const imminent = state.preRotationEnabled && !screen
    ? detectImminentScreen(off, prevOff, ballCarrier, matchups, prevDefenderPositions, state.screenRadius)
    : null;

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

  // B4 V2 — Si un snake dribble est détecté (V sur 3 steps) ET state.
  // snakeKeepCoverage est actif, on BOOST la quality du screen courant
  // à 90 minimum. Effet basket : la défense traite la 2ᵉ utilisation de
  // l'écran comme un VRAI lockdown (D1 plaqué au poseur, D5 hedge fort)
  // au lieu de re-armer depuis zéro. Bien sûr requiert qu'un écran soit
  // aussi détecté à ce step (sinon rien à booster).
  if (state.snakeKeepCoverage && snakeDribble && screen) {
    screenQuality = Math.max(screenQuality, 90);
  }

  // CVT tuning — rayon de décélération `arrive`, lu une fois par couche.
  const slowingRadius = state.steeringSlowingRadius ?? STEERING_MAN_SLOWING_RADIUS_PX;

  // P1.4 — intensité du drive naissant, calculée une fois par step. Le
  // shrink n'a de sens qu'en pré-trigger : si l'aide active est déjà
  // déclenchée (triggers.any), elle prime et le shrink est neutralisé.
  const earlyDriveShrink = state.weakSideShrinkEnabled && !triggers.any
    ? detectEarlyDrive(off, prevOff, ballCarrier, hoop)
    : 0;

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
    let helpKind: 'sag-weakside' | 'helpside-splitline' | 'denial-strongside' | 'active-help' | 'none' | undefined;

    // Override de distance individuel (rule.distance) > global
    let dist = rule.distance ?? state.defenseDistance;
    // CVT Chantier 3c — pondération par profil offensif du marqué.
    // Module la distance effective vs son homme : shooter → tighter
    // close out (manWeight > 1 → dist plus petit) ; slasher → bigger
    // gap pour anticiper drive (manWeight < 1 → dist plus grand).
    // Profil undefined → multipliers (1,1) → comportement legacy
    // strictement préservé (bit-équivalent).
    const profile = state.attackerProfiles?.[oId as AttackerId];
    const mults = scaledProfileMultipliers(profile, state.profileWeightingIntensity ?? 1);
    if (mults.manWeight !== 1) {
      dist = dist / mults.manWeight;
    }
    // CVT 1.1b — defenderPos référence = position précédente effective
    // du défenseur (fallback : layout initial). Indispensable pour que
    // l'`arrive` dampe réellement les micro-oscillations entre frames :
    // c'est dist(prev, target) qui détermine si on est en zone "loin"
    // (bit-équivalent legacy) ou "proche" (target amorti).
    const defenderRef = prevDefenderPositions[dId] ?? state.defenseInitial[dId];
    if (isCarrierDefender) {
      const forces = carrierDefenderTargetForces(defenderRef, rule.vsCarrier, att, dist, hoop, slowingRadius);
      target = forces.length > 0 ? composeTarget(defenderRef, forces) : defenderRef;
    } else {
      const stance = rule.offBallStance ?? 'sag';
      const forces = stance !== 'sag'
        ? offBallStanceTargetForces(defenderRef, att, carrierPos, dist, stance, hoop, slowingRadius)
        : manTargetForces(defenderRef, att, dist, hoop, slowingRadius);
      const stancePos = forces.length > 0 ? composeTarget(defenderRef, forces) : defenderRef;
      target = stancePos;
      // Le help bias n'est appliqué qu'avec la stance "sag" — les stances
      // dirigées (deny-3q, fronting, behind) sont des positions absolues.
      if (stance === 'sag' && att && carrierPos) {
        // Override par défenseur > global > défaut (cf. data/physics.ts).
        const denyAggressiveness = rule.denyAggressiveness ?? state.denyAggressiveness ?? DEFAULT_DENY_AGGRESSIVENESS;
        // Coût tactique de quitter cet attaquant : on aide moins fort si on
        // marque un shooter, plus fort si on marque un non-shooter.
        const leaveMult = leaveAttackerCostMultiplier(state.attackerProfiles?.[oId]);
        // CVT 1.2 — forces vectorielles avec arrive amorti vers le target d'aide.
        const helpRes = computeHelpForces(
          defenderRef, stancePos, rule, triggers, carrierPos, att, side, off, hoop,
          denyAggressiveness, leaveMult, slowingRadius,
          { helpSideStance: state.helpSideStanceEnabled, earlyDriveShrink },
        );
        target = helpRes.forces.length > 0
          ? composeTarget(defenderRef, helpRes.forces)
          : helpRes.target;
        helpFactor = helpRes.helpFactor;
        denying = !!helpRes.denying;
        helpTriggered = !!helpRes.triggered;
        helpAim = helpRes.aim;
        helpPriority = helpRes.priority;
        helpKind = helpRes.kind;
      }
    }

    if (screen && effectiveScreenRule !== 'switch') {
      const hedgeAgg = state.rules[dId]?.hedgeAggression ?? state.hedgeAggression ?? 50;
      target = applyScreenAdjustment(target, screen, effectiveScreenRule, dId, off, state.screenRadius, state.dropDepth, hoop, screenQuality, hedgeAgg);
    }

    // C.4 — Pre-rotation : si pas d'écran encore détecté MAIS un attaquant
    // est en approche (imminent), shifte le carrierDef de ~10 px vers le
    // screener attendu. Effet : épaule tournée, position pré-armée.
    if (imminent && isCarrierDefender) {
      const dx = imminent.screenerPos.x - target.x;
      const dy = imminent.screenerPos.y - target.y;
      const len = Math.hypot(dx, dy) || 1;
      const SHIFT_PX = 10;
      target = {
        x: target.x + (dx / len) * SHIFT_PX,
        y: target.y + (dy / len) * SHIFT_PX,
      };
    }

    // Offset latéral selon le delta manuel d'orientation. Subtil, max ~12px
    // à ±45° (clamp en aval). Pas appliqué si le défenseur est en aide active
    // (helpFactor >= 0.5) : sa position est déjà dictée par la cible d'aide.
    const manualOrientationDelta = rule.orientation ?? 0;
    if (manualOrientationDelta !== 0 && helpFactor < 0.5) {
      target = { x: target.x + orientationLateralOffset(manualOrientationDelta), y: target.y };
    }

    // Calcul orientation Convention B (corps + regard + 2 cibles bras
    // asymétriques) avec invariants anatomiques : regard ∈ ±75° du corps,
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
      hoop,
      prevPos: defenderRef,
    });

    const screenPhase = screen && effectiveScreenRule !== 'switch' && dId === screen.carrierDef
      ? 'impact'
      : undefined;

    // Mismatch severity sur le matchup FINAL (post-switch + post-scram).
    // Toujours ≥ 0 ; mais on évite le bruit visuel en ne propageant la
    // valeur que si elle est ≥ 1 (severity 0 = matchup naturel = aucun
    // indicateur). Le seuil de "warning" pour le visuel + diagnostic
    // coach est piloté par `state.mismatchThreshold` (default 2) dans
    // les couches en aval.
    const severity = mismatchSeverity(dId, oId as AttackerId);
    const scrammedThisStep =
      !!scrammedSwitch && (dId === scrammedSwitch.from || dId === scrammedSwitch.to);

    positions[dId] = {
      // Pas d'arrondi : la position est consommée par l'interpolation
      // de frame (sub-pixel). Round ici → bruit cumulé d'environ 0.5px
      // par frame, soit jusqu'à 30px sur 60 frames.
      x: target.x,
      y: target.y,
      helpFactor,
      isCarrierDefender,
      matchedTo: oId as AttackerId,
      onScreen: !!(screen && (dId === screen.carrierDef || dId === screen.screenerDef)),
      screenPhase,
      switchedThisStep: switchedThisStep && !!(screen && (dId === screen.carrierDef || dId === screen.screenerDef)),
      mismatchSeverity: severity > 0 ? severity : undefined,
      scrammedThisStep: scrammedThisStep || undefined,
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

  // CVT Chantier 3b — pass shadow flag.
  // Calculé en fin de couche sur les positions IDÉALES des défenseurs
  // (avant contraintes de vitesse + couches PnR / écrans). Suffit pour
  // la métadonnée tactique ; un recalcul après speedConstraint serait
  // plus précis mais plus coûteux et redondant pour ce flag d'aide.
  if (ballCarrier && carrierPos) {
    const defenderPositions: Record<string, Point> = {};
    defenderIds.forEach((dId) => {
      const pos = positions[dId];
      if (pos) defenderPositions[dId] = { x: pos.x, y: pos.y };
    });
    const shadows = passShadowsByDefender(
      defenderPositions as Record<import('../../types').DefenderId, Point>,
      ballCarrier,
      carrierPos,
      off,
    );
    defenderIds.forEach((dId) => {
      const pos = positions[dId];
      if (!pos) return;
      if (shadows[dId]) pos.isPassShadowed = true;
    });
  }
}
