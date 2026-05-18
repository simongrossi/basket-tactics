// K.0 → K.7 — Détecteur + correcteur d'anomalies de comportement joueur.
//
// Aucun side effect, aucune mutation. Prend des snapshots minimaux et
// retourne un tableau d'AnomalyReport. Branché sur le pipeline depuis
// useCourtFrame (K.6) ou depuis coachDiagnostics (K.6 règle dédiée).

import type { AttackerPositions, ComputedDefense, DefenderId, DefenderRules, Point } from '@/lib/types';
import type { AnomalyReport, PlayerId } from './types';

/** K.3 — Au-delà de cette distance, un défenseur est considéré "décroché"
 *  de son homme. 250 px ≈ 8 m sur le terrain. */
export const DETACHED_DEFENDER_PX = 250;

/** K.3 — Au-delà : la décroche est `critical`. */
export const DETACHED_DEFENDER_CRITICAL_PX = 450;

/** K.4 — Magnitude minimale de vélocité (px / step) pour considérer un
 *  segment "actif". Sous ce seuil, on ne flag pas (joueur quasi-statique
 *  qui oscille de 1 px à cause du clamp = bruit normal). */
export const FLICKER_MIN_VELOCITY_PX = 5;

/** K.4 — Cosinus seuil entre deux velocités consécutives. Sous cette
 *  valeur (≈ angle > 135°), les deux directions sont quasi-opposées =
 *  oscillation. cos(135°) = -0.707. */
export const FLICKER_COS_THRESHOLD = -0.707;

/** K.5 — Écart max corps↔regard autorisé par CLAUDE.md (Règle 3 — anatomie
 *  figée). Au-delà : le regard est derrière la tête. */
export const GAZE_MAX_DELTA_DEG = 90;

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

/**
 * K.3 V1 — Détecte les défenseurs "décrochés" de leur homme matché.
 *
 * Conditions cumulées :
 *  - Distance défenseur ↔ son homme matché > `threshold` (default 250 px)
 *  - `helpFactor < 0.1` (n'est PAS en train d'aider — sinon la distance
 *    est attendue)
 *  - `screenPhase` ∈ {undefined, 'idle'} (n'est PAS coincé dans un screen
 *    en contact — sinon la distance est attendue)
 *
 * Ne fait PAS de check sur la zone de défense : en zone/junk/press, le
 * concept de matchup individuel n'a pas le même sens. L'appelant doit
 * filtrer si `defenseSystem !== 'man'`.
 */
export function detectDetachedDefenders(
  off: AttackerPositions,
  defPos: ComputedDefense,
  stepIdx: number,
  threshold: number = DETACHED_DEFENDER_PX,
  criticalThreshold: number = DETACHED_DEFENDER_CRITICAL_PX,
): AnomalyReport[] {
  const out: AnomalyReport[] = [];

  (Object.keys(defPos) as DefenderId[]).forEach((id) => {
    const def = defPos[id];
    if (!def) return;
    // Exclusions explicites
    if ((def.helpFactor ?? 0) >= 0.1) return;
    if (def.screenPhase) return;
    const matchedTo = def.matchedTo;
    if (!matchedTo) return;
    const att = off[matchedTo];
    if (!att) return;

    const d = dist({ x: def.x, y: def.y }, att);
    if (d <= threshold) return;

    out.push({
      kind: 'detached',
      severity: d >= criticalThreshold ? 'critical' : 'warning',
      playerId: id,
      stepIdx,
      message: `${id} décroché de ${matchedTo} : ${d.toFixed(0)} px (seuil ${threshold} px)`,
      value: d,
      threshold,
    });
  });

  return out;
}

/**
 * K.4 V1 — Détecte les oscillations (flicker) sur 3 frames consécutives.
 *
 * Un flicker = la direction de déplacement entre prevPrev→prev est
 * quasi-opposée à celle de prev→cur (cos < `FLICKER_COS_THRESHOLD`),
 * ET les deux magnitudes de vélocité sont > `FLICKER_MIN_VELOCITY_PX`.
 *
 * Couvre les défenseurs + attaquants. Symptôme typique d'une couche
 * (matchup flip, screen detection qui oscille, push-out alterné) qui
 * tire le joueur dans une direction puis dans l'autre.
 */
export function detectFlicker(
  prevPrev: FrameSnapshot,
  prev: FrameSnapshot,
  cur: FrameSnapshot,
  minVelocity: number = FLICKER_MIN_VELOCITY_PX,
  cosThreshold: number = FLICKER_COS_THRESHOLD,
): AnomalyReport[] {
  const out: AnomalyReport[] = [];

  function check(playerId: PlayerId, a: Point | undefined, b: Point | undefined, c: Point | undefined): void {
    if (!a || !b || !c) return;
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const m1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const m2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (m1 < minVelocity || m2 < minVelocity) return;
    const cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
    if (cos > cosThreshold) return;

    const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    out.push({
      kind: 'flicker',
      severity: cos <= -0.95 ? 'critical' : 'warning',
      playerId,
      stepIdx: cur.stepIdx,
      message: `${playerId} oscille : virage de ${angleDeg.toFixed(0)}° entre 2 transitions (m1=${m1.toFixed(0)} m2=${m2.toFixed(0)})`,
      value: cos,
      threshold: cosThreshold,
    });
  }

  (Object.keys(cur.off) as Array<keyof typeof cur.off>).forEach((id) => {
    check(id as PlayerId, prevPrev.off[id], prev.off[id], cur.off[id]);
  });
  (Object.keys(cur.defPos) as DefenderId[]).forEach((id) => {
    check(id, prevPrev.defPos[id], prev.defPos[id], cur.defPos[id]);
  });

  return out;
}

/** Renvoie le plus petit delta angulaire signé entre deux angles 0–360°.
 *  Résultat dans [-180, 180]. */
export function circularDeltaDeg(a: number, b: number): number {
  const d = ((a - b) % 360 + 540) % 360 - 180;
  return d;
}

/**
 * K.7 V2 — Clampe les téléportations dans un snapshot.
 *
 * Pour chaque joueur dont la distance prev→cur dépasse `maxStep`, ramène
 * la position à `prev + dir × maxStep`. Pur, retourne un NOUVEAU snapshot
 * (immutable, aucune mutation de `cur`). Préserve les joueurs non clampés.
 *
 * **N'est pas wiré dans le pipeline** par construction (Règle 1bis du
 * projet — toute modif du frameResolver est risquée). À appeler côté UI
 * ou côté script post-hoc sur des snapshots déjà calculés.
 */
export function clampTeleports(
  prev: FrameSnapshot,
  cur: FrameSnapshot,
  maxStep: number = TELEPORT_THRESHOLD_PX,
): FrameSnapshot {
  const off = { ...cur.off };
  const defPos = { ...cur.defPos };

  function clamp(a: Point, b: Point): Point {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= maxStep || d === 0) return b;
    const k = maxStep / d;
    return { x: a.x + dx * k, y: a.y + dy * k };
  }

  (Object.keys(off) as Array<keyof typeof off>).forEach((id) => {
    const a = prev.off[id];
    const b = off[id];
    if (a && b) off[id] = clamp(a, b);
  });
  (Object.keys(defPos) as DefenderId[]).forEach((id) => {
    const a = prev.defPos[id];
    const b = defPos[id];
    if (a && b) defPos[id] = clamp(a, b);
  });

  return { off, defPos, stepIdx: cur.stepIdx };
}

/**
 * K.7 V2 — Clampe les déplacements à `rule.maxSpeed × (1 + tolerance)`
 * pour les défenseurs (compagnon de detectAberrantSpeed). Même contrat
 * d'immutabilité que `clampTeleports`. N'est pas wiré dans le pipeline.
 */
export function clampAberrantSpeed(
  prev: FrameSnapshot,
  cur: FrameSnapshot,
  globalMaxSpeed: number,
  rules: DefenderRules,
  tolerance: number = ABERRANT_SPEED_TOLERANCE,
): FrameSnapshot {
  const defPos = { ...cur.defPos };

  (Object.keys(defPos) as DefenderId[]).forEach((id) => {
    const a = prev.defPos[id];
    const b = defPos[id];
    if (!a || !b) return;
    const indivMax = rules[id]?.maxSpeed ?? globalMaxSpeed;
    if (indivMax <= 0) return;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const limit = indivMax * (1 + tolerance);
    if (d <= limit) return;
    const k = limit / d;
    defPos[id] = { x: a.x + dx * k, y: a.y + dy * k };
  });

  return { off: cur.off, defPos, stepIdx: cur.stepIdx };
}

/**
 * K.5 V1 — Détecte une orientation anormale (regard derrière la tête).
 *
 * CLAUDE.md Règle 3 : "Regard jamais derrière la tête (clamp ±90° du
 * corps)". Le pipeline applique déjà ce clamp dans `computeAttackerVisuals`
 * et `computeDefenderOrientation`. Ce détecteur sert de filet de sécurité :
 * si une couche en aval injecte des angles non clampés, on les flag.
 *
 * Prend les paires { body, gaze } directement (les visuels computés sont
 * stockés différemment selon l'acteur ; l'appelant flattens en amont).
 */
export function detectAnomalousGaze(
  players: Array<{ id: PlayerId; body: number; gaze: number }>,
  stepIdx: number,
  maxDeltaDeg: number = GAZE_MAX_DELTA_DEG,
): AnomalyReport[] {
  const out: AnomalyReport[] = [];
  players.forEach(({ id, body, gaze }) => {
    const delta = Math.abs(circularDeltaDeg(gaze, body));
    if (delta <= maxDeltaDeg) return;
    out.push({
      kind: 'gaze-out-of-range',
      severity: delta >= 135 ? 'critical' : 'warning',
      playerId: id,
      stepIdx,
      message: `${id} regard ${delta.toFixed(0)}° du corps (max ${maxDeltaDeg}° par CLAUDE.md Règle 3)`,
      value: delta,
      threshold: maxDeltaDeg,
    });
  });
  return out;
}
