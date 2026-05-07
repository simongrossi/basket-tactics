import type {
  AttackerPositions,
  ComputedDefense,
  AttackerId,
  Point,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { evaluateOffensiveOptions, type OffensiveAction } from './offense';

/**
 * Phase C : Monte Carlo simple sur l'état courant.
 *
 * Limites assumées du MVP :
 * - La défense est figée pendant la simulation (snapshot de defPos). On
 *   modélise "que se passe-t-il dans les 1-2 secondes suivantes avec
 *   cette configuration défensive" — pas de réaction défensive.
 * - Les attaquants ne se déplacent pas hors du porteur qui drive.
 * - Profondeur max = 4 décisions (typiquement 1-3 passes + 1 tir).
 * - Décision : softmax(EV / temperature) → diversité des choix.
 * - Outcome : shoot rolle un dé selon FG%, pass/drive rolle pour le
 *   succès. Échec = turnover (0 point).
 */

export type PossessionOutcome =
  | 'shot-made'
  | 'shot-missed'
  | 'turnover-pass'
  | 'turnover-drive'
  | 'forced-shot-made'
  | 'forced-shot-missed';

export interface SimulationResult {
  runs: number;
  totalPoints: number;
  /** Points par possession (PPP). Métrique standard NBA/FIBA. */
  ppp: number;
  /** Effective Field Goal % — tient compte de la valeur 3pt. */
  efgPct: number;
  /** Distribution des outcomes (count par type). */
  outcomes: Record<PossessionOutcome, number>;
  /** % de possessions qui ont fini sur un tir réussi. */
  scoreRate: number;
}

const SOFTMAX_TEMPERATURE = 0.3;
const MAX_DEPTH = 4;

function pickActionSoftmax(actions: OffensiveAction[], rng: () => number): OffensiveAction {
  const weights = actions.map((a) => Math.exp(a.expectedPoints / SOFTMAX_TEMPERATURE));
  const sum = weights.reduce((s, w) => s + w, 0);
  let r = rng() * sum;
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i];
    if (r <= 0) return actions[i];
  }
  return actions[0];
}

interface PossessionRun {
  outcome: PossessionOutcome;
  points: number;
  shotAttempts: number;
}

function simulateOnePossession(
  initialOff: AttackerPositions,
  defPos: ComputedDefense,
  initialCarrier: AttackerId,
  hoop: Point,
  rng: () => number
): PossessionRun {
  let off = { ...initialOff };
  let carrier = initialCarrier;
  let depth = 0;
  let shotAttempts = 0;

  while (depth < MAX_DEPTH) {
    const actions = evaluateOffensiveOptions(off, defPos, carrier, hoop);
    const chosen = pickActionSoftmax(actions, rng);

    if (chosen.type === 'shoot') {
      shotAttempts++;
      if (rng() < chosen.scoreProbability) {
        return { outcome: 'shot-made', points: chosen.shotPoints, shotAttempts };
      }
      return { outcome: 'shot-missed', points: 0, shotAttempts };
    }

    if (chosen.type === 'drive') {
      if (rng() > chosen.successRate) {
        return { outcome: 'turnover-drive', points: 0, shotAttempts };
      }
      // Drive aboutit → tir immédiat
      shotAttempts++;
      if (rng() < chosen.scoreProbability) {
        return { outcome: 'shot-made', points: chosen.shotPoints, shotAttempts };
      }
      return { outcome: 'shot-missed', points: 0, shotAttempts };
    }

    // pass-shoot — le tir post-passe est résolu au tour suivant (le receveur
    // devient porteur). On ne shoote pas immédiatement pour modéliser la
    // dynamique : il pourra à son tour repasser ou driver.
    if (rng() > chosen.successRate) {
      return { outcome: 'turnover-pass', points: 0, shotAttempts };
    }
    carrier = chosen.targetId!;
    depth++;
  }

  // Profondeur max atteinte → on force un tir avec ce qu'on a (24s violation
  // émulée). On utilise la qualité de tir actuelle du porteur.
  const actions = evaluateOffensiveOptions(off, defPos, carrier, hoop);
  const shootAction = actions.find((a) => a.type === 'shoot')!;
  shotAttempts++;
  if (rng() < shootAction.scoreProbability) {
    return { outcome: 'forced-shot-made', points: shootAction.shotPoints, shotAttempts };
  }
  return { outcome: 'forced-shot-missed', points: 0, shotAttempts };
}

/**
 * Simule N possessions et agrège les stats. RNG par défaut = Math.random,
 * injectable pour les tests.
 */
export function simulatePossessions(
  off: AttackerPositions,
  defPos: ComputedDefense,
  carrier: AttackerId,
  runs: number,
  hoop: Point = HOOP,
  rng: () => number = Math.random
): SimulationResult {
  let totalPoints = 0;
  let totalAttempts = 0;
  let weightedMakes = 0; // pour eFG : 2pt = 1, 3pt = 1.5
  const outcomes: Record<PossessionOutcome, number> = {
    'shot-made': 0,
    'shot-missed': 0,
    'turnover-pass': 0,
    'turnover-drive': 0,
    'forced-shot-made': 0,
    'forced-shot-missed': 0,
  };

  for (let i = 0; i < runs; i++) {
    const r = simulateOnePossession(off, defPos, carrier, hoop, rng);
    outcomes[r.outcome]++;
    totalPoints += r.points;
    totalAttempts += r.shotAttempts;
    if (r.points === 3) weightedMakes += 1.5;
    else if (r.points === 2) weightedMakes += 1;
  }

  const scoreRate =
    (outcomes['shot-made'] + outcomes['forced-shot-made']) / Math.max(1, runs);

  return {
    runs,
    totalPoints,
    ppp: totalPoints / Math.max(1, runs),
    efgPct: totalAttempts > 0 ? weightedMakes / totalAttempts : 0,
    outcomes,
    scoreRate,
  };
}
