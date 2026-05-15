// Phase I B5+ — Auto-tuning de la calibration live vs Monte-Carlo.
//
// V1 (livré) : `compareCalibration` produit un report avec deltas et
// suggestions textuelles. L'utilisateur ajustait manuellement
// `creativity` selon le sens du delta PPP.
//
// V2 (ici) : boucle automatique qui converge vers le `creativity` qui
// minimise |Δ PPP|. Algorithme dichotomie sur [0, 1] avec arrêt si
// |Δ PPP| ≤ PPP_TOLERANCE ou après MAX_ITERATIONS.
//
// Utilisation :
//   const tuning = autoTuneCreativity(state, { runsPerStep: 50 });
//   console.log(`Best creativity = ${tuning.bestCreativity}, Δ = ${tuning.bestDelta}`);

import type { AppState } from '@/lib/types';
import {
  compareCalibration,
  PPP_TOLERANCE,
  type CalibrationReport,
} from './calibration';

/** Limite d'itérations pour éviter les boucles infinies. À 5, on
 *  couvre creativity = 0.1, 0.3, 0.5, 0.7, 0.9 grossièrement par
 *  dichotomie. */
const MAX_ITERATIONS = 8;

/** Largeur minimale de l'intervalle de recherche avant d'arrêter
 *  (= précision sur creativity). */
const MIN_INTERVAL_WIDTH = 0.05;

export interface TuningStep {
  iteration: number;
  creativity: number;
  deltaPpp: number;
  report: CalibrationReport;
}

export interface AutoTuningResult {
  bestCreativity: number;
  bestDelta: number;
  converged: boolean;
  iterations: number;
  history: TuningStep[];
  /** Le rapport final correspondant au best creativity. */
  finalReport: CalibrationReport;
}

export interface AutoTuningOptions {
  /** Nombre de runs par étape de tuning. 30-50 = compromis vitesse/variance.
   *  Default 30. */
  runsPerStep?: number;
  /** Seed initiale (déterministe). Default Date.now(). */
  seed?: number;
  /** Plage de recherche initiale. Default [0, 1]. */
  creativityRange?: [number, number];
  /** Nombre max d'itérations. Default MAX_ITERATIONS. */
  maxIterations?: number;
}

/**
 * Lance une dichotomie sur `creativity` pour minimiser |Δ PPP|.
 *
 * Heuristique : si Δ > 0 (live trop élevée), on AUGMENTE creativity
 * (plus de variance = moins efficace). Si Δ < 0 (live trop basse),
 * on DIMINUE creativity (plus déterministe = exécute toujours le
 * meilleur EV).
 *
 * Cette monotonicité n'est pas garantie mathématiquement (les EV
 * dépendent de manière complexe de la position et du timing), mais
 * empiriquement c'est une bonne approximation.
 */
export function autoTuneCreativity(
  baseAppState: AppState,
  options: AutoTuningOptions = {}
): AutoTuningResult {
  const runs = options.runsPerStep ?? 30;
  const seed = options.seed ?? Date.now();
  const maxIter = options.maxIterations ?? MAX_ITERATIONS;
  let [low, high] = options.creativityRange ?? [0, 1];

  const history: TuningStep[] = [];
  let bestCreativity = (low + high) / 2;
  let bestDelta = Infinity;
  let bestReport: CalibrationReport | null = null;
  let converged = false;

  for (let i = 0; i < maxIter; i += 1) {
    const creativity = (low + high) / 2;
    const report = compareCalibration(baseAppState, runs, {
      seed: seed + i * 13,
      tickOptions: { creativity },
    });
    const delta = report.delta.ppp;
    history.push({
      iteration: i,
      creativity,
      deltaPpp: delta,
      report,
    });

    // Track meilleur résultat (= |delta| minimal)
    if (Math.abs(delta) < Math.abs(bestDelta)) {
      bestDelta = delta;
      bestCreativity = creativity;
      bestReport = report;
    }

    // Convergence : |delta| sous le seuil
    if (Math.abs(delta) <= PPP_TOLERANCE) {
      converged = true;
      break;
    }

    // Dichotomie : ajuste les bornes selon le signe.
    if (delta > 0) {
      // Live trop élevée → besoin de plus de variance → creativity ↑
      low = creativity;
    } else {
      // Live trop basse → plus déterministe → creativity ↓
      high = creativity;
    }

    // Arrêt si l'intervalle est trop petit
    if (high - low < MIN_INTERVAL_WIDTH) break;
  }

  return {
    bestCreativity,
    bestDelta,
    converged,
    iterations: history.length,
    history,
    finalReport: bestReport ?? history[history.length - 1].report,
  };
}
