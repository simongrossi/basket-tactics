// K.0 + K.1 — Détecteur d'anomalies de comportement joueur (couche pure).
//
// Aucun side effect, aucune mutation. Prend des snapshots minimaux et
// retourne un tableau d'AnomalyReport. Branché sur le pipeline depuis
// useCourtFrame (K.6) ou depuis coachDiagnostics (K.6 règle dédiée).

import type { AttackerPositions, ComputedDefense, DefenderId, Point } from '@/lib/types';
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
