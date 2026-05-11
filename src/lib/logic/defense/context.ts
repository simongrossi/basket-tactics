// Contexte partagé entre les couches du calcul de cibles défensives. Construit
// une fois en début de `computeDefenseTargets`, lu en lecture seule par chaque
// couche. La mutation se fait sur `positions` et `matchups` (passés à part).
//
// Cette séparation lecture/écriture rend chaque couche testable en isolation :
// on construit un ctx de test, on appelle la couche, on inspecte la mutation.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderPositions,
  DetectedScreen,
  DetectedTriggers,
  Matchups,
  Point,
  ScreenRule,
  Step,
} from '../../types';
import { ballSide } from '../geometry';
import { applySwitch, detectScreen, peelSwitchShouldFire } from '../screens';
import { detectTriggers } from '../triggers';
import { carrierDefenderTarget, manTarget } from '../manDefense';
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
import type { DefenderId } from '../../types';

export interface DefenseFrameContext {
  /** AppState courant — lecture seule. */
  state: AppState;
  stepIdx: number;
  /** Le step de l'étape courante (raccourci `state.steps[stepIdx]`). */
  step: Step;
  /** Positions attaquantes actives à cette étape. */
  off: AttackerPositions;
  ballCarrier: AttackerId;
  /** Position du porteur (raccourci `off[ballCarrier]`). */
  carrierPos: Point;
  defenderIds: DefenderId[];
  /** Positions attaquantes à l'étape précédente, ou null si stepIdx === 0. */
  prevOff: AttackerPositions | null;
  /** Positions défensives au début de cette étape (idéales N-1, ou setup si N=0). */
  prevDefenderPositions: DefenderPositions;
  /** Panier côté défense pour cet AppState. */
  hoop: Point;
  /** Triggers détectés (drive/post/paint/any). */
  triggers: DetectedTriggers;
  /** Côté du ballon (-1 G, 0 axe, +1 D). */
  side: -1 | 0 | 1;
  /** Écran porteur détecté ou null. */
  screen: DetectedScreen | null;
  /** Règle d'écran effective (override individuel > global). */
  effectiveScreenRule: ScreenRule;
  /** Vrai si un switch a été appliqué sur l'écran porteur à cette étape. */
  switchedThisStep: boolean;
}

/**
 * Construit le contexte de frame défensive + initialise les matchups (qui
 * peuvent être mutés par les couches : switch, off-ball switch).
 *
 * Effet de bord assumé : si `mutateStepForSwitch === true` ET qu'un switch est
 * détecté sur cette étape, `step.switches` est inscrit dans le state pour
 * persistence (cf. computeDefenseTargets historiquement).
 */
/**
 * Construit les positions défenseurs "prev" à utiliser à l'étape 0. On part
 * de `defenseInitial` puis on remplace la position du carrier defender par
 * sa cible homme-à-homme idéale (collée au porteur). Cela rapproche sa
 * "prevPosition" du jeu et permet à `detectScreen` de trouver les poseurs
 * autour du porteur — sinon, en édition libre (un seul step), D1 est resté
 * loin du jeu et aucun écran n'est jamais détecté par le moteur.
 */
function buildStep0PrevPositions(
  state: AppState,
  off: AttackerPositions,
  ballCarrier: AttackerId,
  matchups: Matchups
): DefenderPositions {
  const base = activeDefenseInitial(state.defenseInitial, state.playerCount);
  const hoop = getDefenseHoop(state);
  const out: DefenderPositions = { ...base };

  // Pour chaque défenseur, on substitue sa cible homme-à-homme idéale.
  // Cela donne à `detectScreen` une géométrie cohérente avec ce qui sera
  // effectivement rendu (chaque défenseur près de son homme), même quand
  // `defenseInitial` est très éloigné de l'attaque en cours.
  (Object.entries(matchups) as [DefenderId, AttackerId][]).forEach(([dId, oId]) => {
    const att = off[oId];
    if (!att) return;
    const rule = state.rules[dId];
    const dist = rule?.distance ?? state.defenseDistance;
    const target = oId === ballCarrier
      ? carrierDefenderTarget(rule?.vsCarrier ?? 'coller', att, dist, hoop) ?? manTarget(att, dist, hoop)
      : manTarget(att, dist, hoop);
    if (target) out[dId] = target;
  });

  return out;
}

export function buildDefenseFrameContext(
  state: AppState,
  stepIdx: number,
  mutateStepForSwitch: boolean
): { ctx: DefenseFrameContext; matchups: Matchups } {
  const step = state.steps[stepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const ballCarrier = activeBallCarrier(step, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);

  // Matchups en début d'étape (avant détection d'écran sur cette étape).
  let matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);

  // Estimation des positions défensives au début de cette étape, pour que la
  // détection d'écran soit basée sur où sont vraiment les défenseurs.
  //
  // CAS PARTICULIER step 0 : en édition libre (un seul step), les défenseurs
  // n'ont pas encore bougé donc `defenseInitial` les place loin du jeu. Or
  // `detectScreen` cherche un poseur à <screenRadius du défenseur du porteur
  // — si D1 est encore à (235,270) au moment où O1 est à (640,380), aucun
  // poseur ne sera jamais à proximité de D1 et l'écran n'est pas détecté.
  // Fix : à step 0, on substitue la position homme-à-homme idéale (collée
  // au porteur) pour le carrier defender, ce qui rapproche la "prevPosition"
  // de l'endroit où D1 va finir et permet la détection d'écran.
  const prevDefenderPositions: DefenderPositions =
    stepIdx === 0
      ? buildStep0PrevPositions(state, off, ballCarrier, matchups)
      : extractDefenderPositions(computeDefenseTargets(state, stepIdx - 1, false).positions);

  const prevOffAtStep: AttackerPositions | undefined =
    stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : undefined;
  const screen = detectScreen(
    off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, step.forcedScreener, prevOffAtStep
  );

  // Règle effective : on regarde l'override individuel du défenseur du porteur,
  // sinon on retombe sur la règle globale.
  const effectiveScreenRule: ScreenRule = (() => {
    if (!screen) return state.screenRule;
    const nav = state.rules[screen.carrierDef]?.screenNav;
    return nav && nav !== 'auto' ? nav : state.screenRule;
  })();

  let switchedThisStep = false;
  if (screen && effectiveScreenRule === 'switch') {
    matchups = applySwitch(matchups, screen);
    switchedThisStep = true;
    if (mutateStepForSwitch && !step.switches) {
      step.switches = [[screen.carrierDef, screen.screenerDef]];
    }
  }
  // PEEL-SWITCH : couverture commence en drop, mais si le porteur a dépassé
  // le défenseur du screener à cette étape, le switch se déclenche.
  if (screen && effectiveScreenRule === 'peel-switch' && !switchedThisStep) {
    const sDefPos = prevDefenderPositions[screen.screenerDef];
    if (sDefPos && peelSwitchShouldFire(off, screen, sDefPos, getDefenseHoop(state))) {
      matchups = applySwitch(matchups, screen);
      switchedThisStep = true;
      if (mutateStepForSwitch && !step.switches) {
        step.switches = [[screen.carrierDef, screen.screenerDef]];
      }
    }
  }

  const prevOff = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : null;
  const hoop = getDefenseHoop(state);
  const triggers = detectTriggers(off, prevOff, ballCarrier, state.triggers, hoop);
  const side = ballSide(off[ballCarrier]);
  const carrierPos = off[ballCarrier];

  const ctx: DefenseFrameContext = {
    state,
    stepIdx,
    step,
    off,
    ballCarrier,
    carrierPos,
    defenderIds,
    prevOff,
    prevDefenderPositions,
    hoop,
    triggers,
    side,
    screen,
    effectiveScreenRule,
    switchedThisStep,
  };

  return { ctx, matchups };
}
