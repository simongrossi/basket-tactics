// Phase L proba — tirage pondéré seedé de la couverture défensive + stats par
// branche. Purs.

import type { AppState, ScreenRule } from '../../types';
import { mulberry32 } from '../rng';

export interface CoverageWeight {
  coverage: ScreenRule;
  weight: number;
}

/** Tire une couverture selon les poids relatifs, de façon déterministe pour un
 *  seed donné. Distribution vide ou poids total ≤ 0 → null. */
export function rollCoverage(
  distribution: CoverageWeight[],
  seed: number,
): ScreenRule | null {
  if (distribution.length === 0) return null;
  const total = distribution.reduce((acc, d) => acc + Math.max(0, d.weight), 0);
  if (total <= 0) return null;
  const r = mulberry32(seed)() * total;
  let acc = 0;
  for (const d of distribution) {
    acc += Math.max(0, d.weight);
    if (r < acc) return d.coverage;
  }
  // Garde-fou flottant : retourne la dernière couverture valide.
  return distribution[distribution.length - 1].coverage;
}

export interface CoverageBranchStat {
  coverage: ScreenRule;
  weight: number;          // normalisé (somme = 1)
  branchId: string | null; // null = chemin principal
  branchLabel: string;
}

/** Pour chaque couverture de la distribution, identifie la branche dont le
 *  trigger screen-coverage l'inclut (la 1ʳᵉ matchante gagne, comme
 *  selectReactiveBranch). Normalise les poids. Pur. */
export function coverageBranchStats(state: AppState): CoverageBranchStat[] {
  const dist = state.coverageDistribution ?? [];
  if (dist.length === 0) return [];
  const branches = state.scenarioBranches ?? [];
  const total = dist.reduce((acc, d) => acc + Math.max(0, d.weight), 0) || 1;
  return dist.map((d) => {
    const branch = branches.find(
      (b) => b.trigger?.kind === 'screen-coverage' && b.trigger.coverage.includes(d.coverage),
    );
    return {
      coverage: d.coverage,
      weight: Math.max(0, d.weight) / total,
      branchId: branch?.id ?? null,
      branchLabel: branch?.label ?? 'chemin principal',
    };
  });
}
