// Phase I — B5 : tuning Monte-Carlo comparé.
//
// Objectif : valider que la game loop live (5 Hz, intent persistant, off-ball
// movers, multi-possessions) produit une PPP comparable au Monte-Carlo
// existant sur le même état initial. Sans cette comparaison, l'IA live
// peut "déraper" silencieusement (par ex. trop conservatrice à cause
// d'intents persistants, ou trop agressive à cause de la créativité).
//
// La cible roadmap = écart de PPP ≤ 0.15 entre live et simulator. Au-delà,
// la calibration est jugée incorrecte et des suggestions sont produites.
//
// Mode d'emploi :
//   const report = compareCalibration(state, 50, { seed: 42 });
//   if (!report.withinTolerance) console.warn(report.suggestions);

import type { AppState } from '@/lib/types';
import {
  simulatePossessions,
  type SimulationResult,
  type PossessionOutcome,
} from '../simulator';
import { effectiveDefensePositions, getDefenseHoop } from '../engine';
import { activeOffense, activeBallCarrier } from '../players';
import {
  createInitialMatchState,
  tickMatch,
  MATCH_TICK_MS,
  type TickMatchOptions,
  type MatchState,
} from './gameLoop';
import type { AiPossessionOutcome } from './aiPossession';
import { mulberry32 } from '../rng';

// ============================================================
// Constantes
// ============================================================

/** Borne de sécurité pour ne pas boucler indéfiniment si une possession
 *  ne se termine jamais (bug moteur). À 2000 ticks × 33 ms = 66 s,
 *  largement plus que 24 s shot clock + 1.5 s pause transition. */
const MAX_TICKS_PER_POSSESSION = 2000;

/** Tolérance d'écart de PPP acceptée. Au-delà → calibration jugée
 *  incorrecte. 0.15 est la cible mentionnée dans la roadmap (§ B5). */
export const PPP_TOLERANCE = 0.15;

/** Seuil d'écart eFG% au-delà duquel on signale un déséquilibre
 *  de sélection de tir (l'IA prend trop de tirs faciles / difficiles). */
const EFG_TOLERANCE = 0.08;

// ============================================================
// Types
// ============================================================

export interface LiveOnlyStats {
  avgPossessionDurationS: number;
  avgEventsPerPossession: number;
  cutsTriggeredPerPossession: number;
  passesPerPossession: number;
  offensiveReboundsObserved: number;
}

export interface MatchLoopAggregateStats {
  possessions: number;
  totalPoints: number;
  /** Points par possession (PPP). Métrique standard NBA/FIBA. */
  ppp: number;
  /** Effective Field Goal %. */
  efgPct: number;
  /** Distribution des outcomes. */
  outcomes: Record<AiPossessionOutcome, number>;
  /** % de possessions ayant fini sur tir réussi. */
  scoreRate: number;
  /** Stats spécifiques au mode live (pas comparables avec simulator). */
  liveOnlyStats: LiveOnlyStats;
}

export interface CalibrationReport {
  liveStats: MatchLoopAggregateStats;
  simulatorStats: SimulationResult;
  delta: {
    ppp: number;
    efgPct: number;
    scoreRate: number;
  };
  /** True si |Δ PPP| ≤ PPP_TOLERANCE. */
  withinTolerance: boolean;
  /** Verdicts lisibles côté UI. */
  suggestions: string[];
}

export interface CalibrationOptions {
  /** Seed pour la reproductibilité. Default Date.now(). */
  seed?: number;
  /** Options passées au tickMatch (creativity, offensiveReboundRate). */
  tickOptions?: TickMatchOptions;
}

// ============================================================
// Headless runner — exécute N possessions sans UI
// ============================================================

/**
 * Joue `possessions` possessions complètes via la game loop, sans UI ni
 * rAF. Retourne les stats agrégées. Une possession se joue avec
 * `maxPossessions: 1` (= se fige après son outcome). Cap dur à
 * MAX_TICKS_PER_POSSESSION pour éviter les boucles infinies.
 */
export function runHeadlessGameLoop(
  baseAppState: AppState,
  possessions: number,
  options: CalibrationOptions = {}
): MatchLoopAggregateStats {
  const baseSeed = options.seed ?? Date.now();
  const tickOptions = options.tickOptions ?? {};

  const outcomes: Record<AiPossessionOutcome, number> = {
    'shot-made': 0,
    'shot-missed': 0,
    'turnover-pass': 0,
    'turnover-drive': 0,
    'turnover-clock': 0,
    'forced-shot-made': 0,
    'forced-shot-missed': 0,
    empty: 0,
  };
  let totalPoints = 0;
  let madeTwos = 0;
  let madeThrees = 0;
  let totalShotsAttempted = 0;
  let totalPossessionDurationS = 0;
  let totalEvents = 0;
  let totalCuts = 0;
  let totalPasses = 0;
  let totalOffRebounds = 0;
  let scoringPossessions = 0;

  for (let i = 0; i < possessions; i += 1) {
    let state: MatchState = createInitialMatchState(baseAppState, {
      seed: baseSeed + i,
      maxPossessions: 1,
    });
    let ticks = 0;
    while (
      ticks < MAX_TICKS_PER_POSSESSION &&
      !(
        state.outcome !== null &&
        state.maxPossessions !== null &&
        state.possessionsPlayed >= state.maxPossessions
      )
    ) {
      state = tickMatch(state, MATCH_TICK_MS, baseAppState, tickOptions);
      ticks += 1;
    }

    const outcome = state.outcome ?? 'empty';
    outcomes[outcome] += 1;
    // cumulativeScore intègre déjà le score de cette possession (B3b).
    totalPoints += state.cumulativeScore;
    if (outcome === 'shot-made' || outcome === 'forced-shot-made') {
      scoringPossessions += 1;
      // Détecter 2pt vs 3pt via le dernier shot event.
      const lastShot = [...state.eventLog].reverse().find(
        (e) => e.type === 'shot' || e.type === 'forced-shot'
      );
      if (lastShot?.shotPointsAttempted === 3) madeThrees += 1;
      else madeTwos += 1;
    }
    // Compte les tirs tentés (réussis + manqués + forced).
    const shotsThisPoss = state.eventLog.filter(
      (e) => e.type === 'shot' || e.type === 'forced-shot'
    ).length;
    totalShotsAttempted += shotsThisPoss;

    totalPossessionDurationS += state.possessionTimeMs / 1000;
    totalEvents += state.eventLog.length;
    totalCuts += state.eventLog.filter((e) => e.label.toLowerCase().includes('cut')).length;
    totalPasses += state.eventLog.filter((e) => e.type === 'pass').length;
    totalOffRebounds += state.eventLog.filter((e) =>
      e.label.includes('Rebond offensif')
    ).length;
  }

  const ppp = possessions > 0 ? totalPoints / possessions : 0;
  // eFG% = (FG + 0.5 × 3PT) / FGA — bonus 50 % pour les 3pt réussis.
  const efgPct =
    totalShotsAttempted > 0
      ? (madeTwos + madeThrees * 1.5) / totalShotsAttempted
      : 0;
  const scoreRate = possessions > 0 ? scoringPossessions / possessions : 0;

  return {
    possessions,
    totalPoints,
    ppp,
    efgPct,
    outcomes,
    scoreRate,
    liveOnlyStats: {
      avgPossessionDurationS: possessions > 0 ? totalPossessionDurationS / possessions : 0,
      avgEventsPerPossession: possessions > 0 ? totalEvents / possessions : 0,
      cutsTriggeredPerPossession: possessions > 0 ? totalCuts / possessions : 0,
      passesPerPossession: possessions > 0 ? totalPasses / possessions : 0,
      offensiveReboundsObserved: totalOffRebounds,
    },
  };
}

// ============================================================
// Comparaison — live vs Monte-Carlo
// ============================================================

/**
 * Exécute N possessions live + N Monte-Carlo sur le même `baseAppState`
 * et retourne un rapport comparatif. La cible roadmap est |Δ PPP| ≤ 0.15.
 */
export function compareCalibration(
  baseAppState: AppState,
  possessions: number,
  options: CalibrationOptions = {}
): CalibrationReport {
  const liveStats = runHeadlessGameLoop(baseAppState, possessions, options);

  // Monte-Carlo : reprend le snapshot état + applique simulatePossessions.
  // On extrait off + defPos depuis le step actif (le simulator est
  // figé sur ce snapshot).
  const step = baseAppState.steps[baseAppState.activeStep];
  if (!step) {
    // Cas dégénéré : on retourne le live + un simulator vide.
    const emptySim: SimulationResult = {
      runs: 0,
      totalPoints: 0,
      ppp: 0,
      efgPct: 0,
      outcomes: {
        'shot-made': 0,
        'shot-missed': 0,
        'turnover-pass': 0,
        'turnover-drive': 0,
        'forced-shot-made': 0,
        'forced-shot-missed': 0,
      },
      scoreRate: 0,
    };
    return buildReport(liveStats, emptySim);
  }
  // On délègue à simulatePossessions qui prend off + defPos + carrier + hoop.
  const off = activeOffense(step.off, baseAppState.playerCount);
  const defPos = effectiveDefensePositions(baseAppState, baseAppState.activeStep);
  const carrier = activeBallCarrier(step, baseAppState.playerCount);
  const hoop = getDefenseHoop(baseAppState);
  // RNG seedée pour reproductibilité ; même seed que le live mais offset
  // pour ne pas corréler les deux runs.
  const rng = options.seed != null ? mulberry32(options.seed + 7919) : Math.random;
  const simulatorStats = simulatePossessions(off, defPos, carrier, possessions, hoop, rng);
  return buildReport(liveStats, simulatorStats);
}

function buildReport(
  liveStats: MatchLoopAggregateStats,
  simulatorStats: SimulationResult
): CalibrationReport {
  const deltaPpp = liveStats.ppp - simulatorStats.ppp;
  const deltaEfg = liveStats.efgPct - simulatorStats.efgPct;
  const deltaScoreRate = liveStats.scoreRate - simulatorStats.scoreRate;
  const withinTolerance = Math.abs(deltaPpp) <= PPP_TOLERANCE;

  const suggestions: string[] = [];
  if (!withinTolerance) {
    if (deltaPpp > 0) {
      suggestions.push(
        `PPP live (${liveStats.ppp.toFixed(2)}) trop élevée vs simulator (${simulatorStats.ppp.toFixed(2)}) ` +
          `(Δ +${deltaPpp.toFixed(2)}). L'IA live est trop efficace : envisager d'augmenter la créativité ` +
          `(plus de variance) ou de réduire le boost de cut.`
      );
    } else {
      suggestions.push(
        `PPP live (${liveStats.ppp.toFixed(2)}) trop basse vs simulator (${simulatorStats.ppp.toFixed(2)}) ` +
          `(Δ ${deltaPpp.toFixed(2)}). L'IA live est trop conservatrice : réduire la créativité ` +
          `(plus déterministe) ou augmenter le forced-shot threshold.`
      );
    }
  }
  if (Math.abs(deltaEfg) > EFG_TOLERANCE) {
    suggestions.push(
      `eFG% live (${(liveStats.efgPct * 100).toFixed(1)} %) vs simulator (${(simulatorStats.efgPct * 100).toFixed(1)} %), ` +
        `Δ ${(deltaEfg * 100).toFixed(1)} %. Déséquilibre dans la sélection de tirs ` +
        `(zone, contestation).`
    );
  }
  if (liveStats.liveOnlyStats.cutsTriggeredPerPossession < 0.1) {
    suggestions.push(
      `Très peu de cuts déclenchés (${liveStats.liveOnlyStats.cutsTriggeredPerPossession.toFixed(2)} / possession). ` +
        `Vérifier le seuil de probabilité CUT_PROBABILITY dans offBallMover.`
    );
  }

  return {
    liveStats,
    simulatorStats,
    delta: {
      ppp: deltaPpp,
      efgPct: deltaEfg,
      scoreRate: deltaScoreRate,
    },
    withinTolerance,
    suggestions,
  };
}

/** Pour les consommateurs UI qui veulent caster `AiPossessionOutcome → PossessionOutcome`
 *  (ils partagent les mêmes clés sauf les issues non modélisées par le simulateur). */
export function liveOutcomeToSimulator(
  o: AiPossessionOutcome
): PossessionOutcome | null {
  if (o === 'empty' || o === 'turnover-clock') return null;
  return o;
}
