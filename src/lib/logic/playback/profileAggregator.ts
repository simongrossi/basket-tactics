// J.5 — Agrégation de FrameProfile sur N frames (mean / max / p95 par phase).
//
// Le profiler `createFrameProfiler` produit un profile par frame
// (`{ totalMs, phases: { attackers, screens, ... } }`). Pour donner une
// vue utile au coach, on accumule les profiles sur une fenêtre glissante
// puis on calcule des stats par phase.
//
// Module pur, testable hors moteur. L'UI maintient le buffer dans un
// ref/state local.

import type { FrameProfile, FrameProfilePhase } from './frameResolver';

export interface PhaseStats {
  /** Moyenne ms */
  mean: number;
  /** Max observé sur la fenêtre */
  max: number;
  /** 95e percentile (= proxy "pire frame en pratique") */
  p95: number;
  /** Somme totale (utile pour ratio) */
  sum: number;
}

export interface AggregatedProfile {
  /** Nombre de frames dans la fenêtre */
  count: number;
  /** Stats par phase */
  byPhase: Record<FrameProfilePhase, PhaseStats>;
  /** Total = somme des phases (par frame). Mean = moyenne du totalMs. */
  total: PhaseStats;
  /** Phase la plus coûteuse en moyenne (pour highlight UI). */
  hottestPhase: FrameProfilePhase | null;
}

const EMPTY_STATS: PhaseStats = { mean: 0, max: 0, p95: 0, sum: 0 };
const PHASES: FrameProfilePhase[] = [
  'attackers', 'screens', 'obstacles', 'defenders',
  'collisions', 'rateLimiter', 'ball',
];

export function aggregateProfiles(profiles: FrameProfile[]): AggregatedProfile {
  if (profiles.length === 0) {
    return {
      count: 0,
      byPhase: PHASES.reduce((acc, p) => {
        acc[p] = { ...EMPTY_STATS };
        return acc;
      }, {} as Record<FrameProfilePhase, PhaseStats>),
      total: { ...EMPTY_STATS },
      hottestPhase: null,
    };
  }

  // Stats par phase.
  const byPhase = PHASES.reduce((acc, phase) => {
    const values = profiles.map((p) => p.phases[phase]);
    acc[phase] = computeStats(values);
    return acc;
  }, {} as Record<FrameProfilePhase, PhaseStats>);

  // Stats totales.
  const totalValues = profiles.map((p) => p.totalMs);
  const total = computeStats(totalValues);

  // Phase la plus coûteuse (mean).
  let hottestPhase: FrameProfilePhase | null = null;
  let hottestMean = -Infinity;
  PHASES.forEach((p) => {
    if (byPhase[p].mean > hottestMean) {
      hottestMean = byPhase[p].mean;
      hottestPhase = p;
    }
  });

  return {
    count: profiles.length,
    byPhase,
    total,
    hottestPhase,
  };
}

function computeStats(values: number[]): PhaseStats {
  if (values.length === 0) return { ...EMPTY_STATS };
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;
  const max = values.reduce((a, b) => (b > a ? b : a), -Infinity);
  const sorted = [...values].sort((a, b) => a - b);
  // p95 : valeur à l'index ceil(0.95 × n) - 1, clamp.
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(values.length * 0.95) - 1));
  const p95 = sorted[idx];
  return { mean, max, p95, sum };
}

/** Buffer glissant : garde les `maxSize` derniers profiles. Mutable. */
export class ProfileRingBuffer {
  private buf: FrameProfile[] = [];

  constructor(public readonly maxSize: number = 120) {}

  push(p: FrameProfile): void {
    this.buf.push(p);
    if (this.buf.length > this.maxSize) {
      this.buf.shift();
    }
  }

  clear(): void {
    this.buf = [];
  }

  size(): number {
    return this.buf.length;
  }

  snapshot(): FrameProfile[] {
    return this.buf.slice();
  }
}
