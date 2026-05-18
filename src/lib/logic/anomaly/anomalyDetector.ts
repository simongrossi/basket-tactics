// K.0 + K.1 + K.2 — Détecteur d'anomalies de comportement joueur (couche pure).
//
// Aucun side effect, aucune mutation. Prend des snapshots minimaux et
// retourne un tableau d'AnomalyReport. Branché sur le pipeline depuis
// useCourtFrame (K.6) ou depuis coachDiagnostics (K.6 règle dédiée).

import type { AttackerPositions, ComputedDefense, DefenderId, DefenderRules, Point } from '@/lib/types';
import type { AnomalyReport, PlayerId } from './types';

/** Seuil de saut entre deux frames consécutives, en pixels.
 *  Le pipeline clampe déjà visuellement à 18 px/frame (MAX_DEFENDER_JUMP_PX
 *  dans frameResolver). On flag dès qu'un saut > 24 px est détecté entre
 *  deux STEP-frames consécutives (= snapshot après clamp), ce qui révèle
 *  une cible logique qui voulait téléporter même après clamp visuel. */
export const TELEPORT_THRESHOLD_PX = 24;

/** Saut critique : au-delà, l'anomalie devient `critical`. Typiquement
 *  un matchup flip ou un crash logique. */
export const TELEPORT_CRITICAL_PX = 60;

export interface FrameSnapshot {
  off: AttackerPositions;
  defPos: Record<DefenderId, Point>;
  stepIdx: number;
}

/** Extrait les positions x/y plates depuis une ComputedDefense (qui
 *  embarque des flags additionnels comme `helpFactor`, `matchedTo`...). */
export function flattenDefPos(defPos: ComputedDefense): Record<DefenderId, Point> {
  const out = {} as Record<DefenderId, Point>;
  (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][]).forEach(([id, p]) => {
    out[id] = { x: p.x, y: p.y };
  });
  return out;
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * K.1 V1 — Détecte les téléportations entre deux frames consécutives.
 *
 * Une téléportation = position(N) → position(N+1) avec une distance
 * supérieure à `threshold` px. Le seuil par défaut est 24 px, légèrement
 * au-dessus du clamp visuel à 18 px (laisse passer le bruit normal).
 *
 * Retourne TOUS les joueurs (attaquants + défenseurs) dont la position
 * a sauté. Le tri se fait en aval (UI / coach diag).
 */
export function detectTeleport(
  prev: FrameSnapshot,
  cur: FrameSnapshot,
  threshold: number = TELEPORT_THRESHOLD_PX,
  criticalThreshold: number = TELEPORT_CRITICAL_PX,
): AnomalyReport[] {
  const out: AnomalyReport[] = [];

  // Attaquants
  (Object.keys(cur.off) as Array<keyof typeof cur.off>).forEach((id) => {
    const a = prev.off[id];
    const b = cur.off[id];
    if (!a || !b) return;
    const d = dist(a, b);
    if (d > threshold) {
      out.push({
        kind: 'teleport',
        severity: d >= criticalThreshold ? 'critical' : 'warning',
        playerId: id as PlayerId,
        stepIdx: cur.stepIdx,
        message: `${id} a sauté de ${d.toFixed(0)} px en 1 step (seuil ${threshold} px)`,
        value: d,
        threshold,
      });
    }
  });

  // Défenseurs
  (Object.keys(cur.defPos) as DefenderId[]).forEach((id) => {
    const a = prev.defPos[id];
    const b = cur.defPos[id];
    if (!a || !b) return;
    const d = dist(a, b);
    if (d > threshold) {
      out.push({
        kind: 'teleport',
        severity: d >= criticalThreshold ? 'critical' : 'warning',
        playerId: id,
        stepIdx: cur.stepIdx,
        message: `${id} a sauté de ${d.toFixed(0)} px en 1 step (seuil ${threshold} px)`,
        value: d,
        threshold,
      });
    }
  });

  return out;
}

/** K.2 — Tolérance multiplicative sur la vitesse max. Au-dessus de
 *  `maxSpeed × (1 + ABERRANT_SPEED_TOLERANCE)`, on flag.
 *
 *  Couvre la marge légitime des boosters (sprintBoost ×1.8, closeoutBoost),
 *  qui sont déjà intégrés au pipeline. Au-delà, le défenseur "voyage" plus
 *  vite qu'aucun mécanisme connu ne le permet → anomalie.
 *
 *  0.95 = sprintBoost×1.8 (max documenté) + marge bruit numérique. */
export const ABERRANT_SPEED_TOLERANCE = 0.95;

/** K.2 — Ratio (d / maxSpeed) au-delà duquel la sévérité est `critical`. */
export const ABERRANT_SPEED_CRITICAL_MULT = 3.0;

/**
 * K.2 V1 — Détecte un défenseur dont le déplacement step→step dépasse
 * `rule.maxSpeed × (1 + tolerance)` (default 1.95).
 *
 * Ne flag PAS les attaquants (pas de maxSpeed dans le modèle V1, leurs
 * profils sont sur la phase Step et non sur le step→step direct).
 *
 * `globalMaxSpeed` = `state.defenseMaxSpeed`. Override individuel via
 * `rules[id].maxSpeed`.
 */
export function detectAberrantSpeed(
  prev: FrameSnapshot,
  cur: FrameSnapshot,
  globalMaxSpeed: number,
  rules: DefenderRules,
  tolerance: number = ABERRANT_SPEED_TOLERANCE,
  criticalMult: number = ABERRANT_SPEED_CRITICAL_MULT,
): AnomalyReport[] {
  const out: AnomalyReport[] = [];

  (Object.keys(cur.defPos) as DefenderId[]).forEach((id) => {
    const a = prev.defPos[id];
    const b = cur.defPos[id];
    if (!a || !b) return;
    const indivMax = rules[id]?.maxSpeed ?? globalMaxSpeed;
    if (indivMax <= 0) return;

    const d = dist(a, b);
    const limit = indivMax * (1 + tolerance);
    if (d <= limit) return;

    const ratio = d / indivMax;
    out.push({
      kind: 'aberrant-speed',
      severity: ratio >= criticalMult ? 'critical' : 'warning',
      playerId: id,
      stepIdx: cur.stepIdx,
      message: `${id} a parcouru ${d.toFixed(0)} px en 1 step (max ~${indivMax.toFixed(0)} px, ratio ×${ratio.toFixed(2)})`,
      value: d,
      threshold: limit,
    });
  });

  return out;
}
