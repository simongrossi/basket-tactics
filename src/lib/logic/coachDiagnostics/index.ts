// Moteur de diagnostics coach.
//
// Pattern **registry de règles** : chaque diagnostic métier vit dans
// `rules/<name>.ts` sous la forme `(ctx) => CoachDiagnostic[]`. L'orchestrateur
// `computeCoachDiagnostics` :
//
//  1. construit un `RuleContext` partagé (positions, matchups, défenseurs actifs…)
//  2. itère le registry dans un ordre fixe (la dédup post-collection en dépend)
//  3. dédupe `pass-open` vs `corner-*` (deux règles détectent parfois le même
//     attaquant — on garde la version corner, plus granulaire)
//  4. ajoute "all-good" en finalizer si rien n'a été émis
//
// ### Pour ajouter un nouveau diagnostic
//
// 1. Créer `rules/<myDiag>.ts` qui exporte `(ctx) => CoachDiagnostic[]`.
// 2. Ajouter l'import + l'entrée dans `REGISTRY` ci-dessous, à la bonne
//    position selon les dépendances de dédup (par défaut : en fin).
// 3. Tester unitairement : `myDiagRule(fakeCtx)` doit retourner les bonnes
//    phrases. Pas de mock React nécessaire.

import {
  effectiveDefensePositions,
  getDefenseHoop,
} from '../engine';
import { activeBallCarrier, activeOffense, getActiveDefenderIds } from '../players';
import type { AppState } from '../../types';
import type { CoachDiagnostic, Rule, RuleContext } from './types';
import { sideOf } from './helpers';

// Re-exports publics — préserve l'API historique.
export type { CoachDiagnostic, CoachSeverity, Rule, RuleContext } from './types';

// ----- Registry de règles -----
//
// L'ordre est SIGNIFICATIF :
//  - pickAndRoll doit s'exécuter avant les checks transverses qui regardent
//    `pnrRole` (déjà figé par `effectiveDefensePositions`, donc tout va bien)
//  - passOpen suppose que cornerAbandoned a déjà tourné → dédup post-collecte
//  - tacticalReads vient en fin (lecture offensive, après tous les diag défense)
//
import { closeoutLongRule } from './rules/closeoutLong';
import { shooterCloseoutRule } from './rules/shooterCloseout';
import { switchMismatchRule } from './rules/switchMismatch';
import { attackerJumpRule } from './rules/attackerJump';
import { baselineDriveRule } from './rules/baselineDriveCoverage';
import { driveContainmentRule } from './rules/driveContainment';
import { offBallCutsRule } from './rules/offBallCuts';
import { matchupOrphansRule } from './rules/matchupOrphans';
import { pickAndRollRule } from './rules/pickAndRoll';
import { rejectedScreenRule } from './rules/rejectedScreen';
import { snakeDribbleRule } from './rules/snakeDribble';
import { screenChainRule } from './rules/screenChain';
import { emptySidePnRRule } from './rules/emptySidePnR';
import { zoneSituationsRule } from './rules/zoneSituations';
import { offBallScreensRule } from './rules/offBallScreens';
import { cornerAbandonedRule } from './rules/cornerAbandoned';
import { passOpenRule } from './rules/passOpen';
import { paintNoHelpRule } from './rules/paintNoHelp';
import { tacticalReadsRule } from './rules/tacticalReads';
import { inboundFiveSecRule } from './rules/inboundFiveSec';
import { boxOutCheckRule } from './rules/boxOutCheck';
import { inboundDefenseRule } from './rules/inboundDefense';
import { foulToGiveRule } from './rules/foulToGive';
import { endOfClockRule } from './rules/endOfClock';
import { outletPassRule } from './rules/outletPass';
import { awayPossessionRule } from './rules/awayPossession';
import { playerAnomalyRule } from './rules/playerAnomaly';

const REGISTRY: Rule[] = [
  closeoutLongRule,
  shooterCloseoutRule,
  switchMismatchRule,
  attackerJumpRule,
  baselineDriveRule,
  driveContainmentRule,
  offBallCutsRule,
  matchupOrphansRule,
  pickAndRollRule,
  rejectedScreenRule,
  snakeDribbleRule,
  screenChainRule,
  emptySidePnRRule,
  zoneSituationsRule,
  offBallScreensRule,
  cornerAbandonedRule,
  passOpenRule, // dédupé contre corner-* dans dedupePassOpenVsCorner
  paintNoHelpRule,
  inboundFiveSecRule,
  inboundDefenseRule,
  boxOutCheckRule,
  tacticalReadsRule,
  foulToGiveRule,
  endOfClockRule,
  outletPassRule,
  awayPossessionRule,
  playerAnomalyRule,
];

/**
 * Élimine les `pass-open` redondants avec un `corner-*` sur le même attaquant.
 * Les corner-* sont plus granulaires (severity calée sur shooter + intensité)
 * donc ils gagnent.
 */
function dedupePassOpenVsCorner(diagnostics: CoachDiagnostic[]): CoachDiagnostic[] {
  const cornerAttackers = new Set<string>();
  diagnostics.forEach((d) => {
    if (d.tag.startsWith('corner-')) {
      d.attackers.forEach((a) => cornerAttackers.add(a));
    }
  });
  return diagnostics.filter((d) => {
    if (d.tag !== 'pass-open') return true;
    return !d.attackers.some((a) => cornerAttackers.has(a));
  });
}

/**
 * Diagnostics coach automatiques.
 *
 * Convertit l'état défensif calculé (positions, late, helpFactor, switches,
 * écrans détectés) en phrases courtes utilisant le vocabulaire d'un coach :
 * "low man tag", "corner abandonné", "closeout long", "skip ouvert",
 * "mismatch après switch". Pas de chiffres bruts sauf nécessaire — les pills
 * de MetricsBar font déjà ce job.
 *
 * Chaque diagnostic est tagué pour permettre filtres/évolutions, et porte
 * la liste des joueurs concernés pour permettre un highlight visuel dans
 * une itération future.
 */
export function computeCoachDiagnostics(
  state: AppState,
  stepIdx: number
): CoachDiagnostic[] {
  const cur = state.steps[stepIdx];
  if (!cur) return [];
  const off = activeOffense(cur.off, state.playerCount);
  const carrier = activeBallCarrier(cur, state.playerCount);
  const carrierPos = off[carrier];
  if (!carrierPos) return [];

  const defPos = effectiveDefensePositions(state, stepIdx);
  const hoop = getDefenseHoop(state);
  const carrierSide = sideOf(carrierPos, hoop);

  const ctx: RuleContext = {
    state,
    stepIdx,
    off,
    carrier,
    carrierPos,
    carrierSide,
    defPos,
    defenderIds: getActiveDefenderIds(state.playerCount),
    hoop,
    profiles: state.attackerProfiles,
    cur,
  };

  // Itération du registry — chaque règle voit le même contexte.
  let out: CoachDiagnostic[] = [];
  for (const rule of REGISTRY) {
    out = out.concat(rule(ctx));
  }

  // Dédup post-collecte (pass-open vs corner-*).
  out = dedupePassOpenVsCorner(out);

  // Finalizer : feedback positif si aucun diagnostic.
  if (out.length === 0) {
    out.push({
      id: 'all-good',
      severity: 'good',
      message: 'Couverture propre : porteur pressé, aide en place, corners tenus',
      tag: 'all-good',
      defenders: [],
      attackers: [],
    });
  }

  return out;
}
