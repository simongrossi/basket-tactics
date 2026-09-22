import type { Annotation, AnnotationType, AttackerId, Point, Step } from '@/lib/types';
import { samplePolyline, polylineLength } from './polyline';
import { resolveAnnotationTiming } from './annotationTiming';
import { maybeFlipCutPath } from './cutSideFlip';
import {
  buildVelocityProfile,
  type AttackerSpeedTier,
  type VelocityProfile,
} from './velocityProfile';
import { pxToMeters, metersToPx } from '../data/physics';

const SCREEN_SET_FRACTION = 0.35;

/**
 * Tolérance pour détecter une annotation de mouvement « périmée » placée sur
 * le step de DESTINATION du déplacement. Certains générateurs
 * (genZoomAction, genRipDho, etc.) appellent
 * `annot(type, fromId, prev.off, off1)` puis attachent l'annotation au step
 * dont `off = off1`. L'annotation décrit donc un déplacement déjà effectué :
 * `ann.from = step précédent`, `ann.to = step actuel`, et le joueur EST déjà
 * à `ann.to` au début du segment courant. Sans filtre, la couche playback
 * re-joue ce déplacement et fait reculer le joueur vers `ann.from` (effet
 * rubber-band masqué par le rate-limiter en deçà de 18 px/frame, visible
 * au-delà). On détecte ce cas par `|cur.off - ann.to| ≤ tolérance` et on
 * ignore l'annotation.
 */
export const ANNOTATION_STALE_TO_TOLERANCE_PX = 2;

function annotationPolyline(ann: Annotation): Point[] {
  return ann.waypoints && ann.waypoints.length > 0
    ? [ann.from, ...ann.waypoints, ann.to]
    : [ann.from, ann.to];
}

export type MovementType = 'cut' | 'dribble' | 'screen' | 'idle';

export interface PlaybackTrajectory {
  position: Point;
  movementType: MovementType;
  isScreening: boolean;
  /** Route sélectionnée et progression après timing, sprint et profil de vitesse. */
  route?: { path: Point[]; progress: number };
}

const MOVEMENT_TYPES = new Set<AnnotationType>(['cut', 'dribble', 'screen']);

function findMovementAnnotations(step: Step, playerId: AttackerId): Annotation[] {
  return step.annotations.filter(
    (a) => MOVEMENT_TYPES.has(a.type) && a.fromId === playerId,
  );
}

function movementPriority(type: AnnotationType): number {
  if (type === 'screen') return 3;
  if (type === 'dribble') return 2;
  if (type === 'cut') return 1;
  return 0;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Pour le joueur `playerId` au step `stepIdx`, calcule sa position pendant
 * le segment vers Step[stepIdx+1] à `localT ∈ [0, 1]`.
 *
 * Trajectoires :
 * - aucune annotation de mouvement → idle (interpolation entre étapes).
 * - `cut` → ligne droite from → to.
 * - `dribble` → ligne droite from → to (la wave est purement visuelle, côté schéma).
 * - `screen` → arrive vite à `to`, puis reste planté ; isScreening=true dès que le poseur est fixé.
 *
 * Édition continue (Étape 10) : si l'annotation porte `tStart`/`tEnd`
 * (0..1), l'action n'occupe que [tStart, tEnd] dans le segment. Avant tStart
 * le joueur est à anno.from, après tEnd à anno.to. Cela permet à plusieurs
 * actions parallèles d'avoir des durées différentes (un écran rapide à
 * [0, 0.4], un dribble plus long [0.3, 1.0], etc.).
 *
 * NB : aucune logique d'évitement d'obstacles ici. CourtView l'applique en
 * couche pour cut / dribble / idle, en utilisant la route et sa progression.
 */
/** Phy.O — Options pour le remap par profil de vitesse. Construites par
 *  le caller à partir de `state` ; absent ou `enabled: false` → legacy. */
export interface PlaybackVelocityProfileOptions {
  enabled: boolean;
  /** Renvoie le tier d'un attaquant (ou undefined = standard). */
  tierFor?: (id: AttackerId) => AttackerSpeedTier | undefined;
  /** Phy.O V2 — Renvoie le snapshot d'obstacles mid-segment pour
   *  l'attaquant `id` (exclu de la liste). */
  obstaclesFor?: (id: AttackerId) => Point[];
  /** Phy.O V3 V1 — Position mid-segment du matched defender. Sans
   *  callback ou retour undefined, la lecture défensive est inactive. */
  matchedDefenderFor?: (id: AttackerId) => Point | undefined;
  /** Phy.O V3 V2 — Position mid-segment du matched defender pour le flip de
   *  côté du cut. TOUJOURS fourni (indépendant de attackerActiveDemarquage),
   *  contrairement à matchedDefenderFor qui est gaté sur le flag V3 V1. */
  flipDefenderFor?: (id: AttackerId) => Point | undefined;
  /** Phy.O V3 V4 — Active le boost post-feinte (lecture proactive). */
  postFeinteBoost?: boolean;
  durationSec?: number;
  accelerationEnabled?: boolean;
  acceleration?: number;
  momentumEnabled?: boolean;
  momentum?: number;
}

/** Cache de profils par annotation × tier. Évite de re-construire le profil
 *  à chaque frame (le path et le tier ne changent pas). */
const profileCache = new WeakMap<Annotation, Map<string, VelocityProfile>>();

function getOrBuildProfile(
  ann: Annotation,
  path: Point[],
  tier: AttackerSpeedTier | undefined,
  obstacles: Point[],
  matchedDefenderPos: Point | undefined,
  postFeinteBoost: boolean,
  durationSec?: number,
  accelerationEnabled?: boolean,
  acceleration?: number,
  startFromStandstill?: boolean,
  endAtStandstill?: boolean,
  flipApplied?: boolean,
): VelocityProfile {
  let perAnn = profileCache.get(ann);
  if (!perAnn) {
    perAnn = new Map();
    profileCache.set(ann, perAnn);
  }
  const tierKey = tier ?? 'standard';
  // Hash des obstacles : positions arrondies à l'entier, jointes.
  // Invalide naturellement quand un joueur bouge.
  const obstaclesHash = obstacles.length === 0
    ? '0'
    : obstacles.map((o) => `${o.x | 0},${o.y | 0}`).join(';');
  // Phy.O V4 — feintes incluses dans la clé : positions arrondies à 0.01.
  const feintes = ann.feintes ?? [];
  const feintesHash = feintes.length === 0
    ? '0'
    : feintes.map((t) => Math.round(t * 100)).join(',');
  // Phy.O V3 V1 — matchedDefenderPos arrondi à l'entier inclus dans la clé.
  const mdpHash = matchedDefenderPos
    ? `${matchedDefenderPos.x | 0},${matchedDefenderPos.y | 0}`
    : '0';
  // Phy.O V3 V4 — flag boost inclus dans la clé.
  const boostKey = postFeinteBoost ? '1' : '0';
  const key = `${tierKey}|${obstaclesHash}|${feintesHash}|${mdpHash}|${boostKey}|${durationSec ?? 2}|${accelerationEnabled ? '1' : '0'}|${acceleration ?? 5}|${startFromStandstill ? '1' : '0'}|${endAtStandstill ? '1' : '0'}|${flipApplied ? '1' : '0'}`;
  let profile = perAnn.get(key);
  if (!profile) {
    profile = buildVelocityProfile(path, {
      tier,
      obstacles,
      feintes,
      matchedDefenderPos,
      postFeinteBoost,
      durationSec,
      accelerationEnabled,
      acceleration,
      startFromStandstill,
      endAtStandstill,
    });
    perAnn.set(key, profile);
  }
  return profile;
}

export function attackerTrajectoryAt(
  steps: Step[],
  stepIdx: number,
  playerId: AttackerId,
  localT: number,
  /** B.4 — Optionnel. Si fourni, la résolution des bornes temporelles
   *  d'annotation passe par `resolveAnnotationTiming`, qui priorise
   *  `tStartAbs/tEndAbs` (secondes) sur `tStart/tEnd` (fractions). Sans
   *  cette fonction, comportement legacy (fractions uniquement). */
  getStepDurationSec?: (idx: number) => number,
  /** Phy.O — Optionnel. Si fourni avec `enabled: true`, le sampling des
   *  paths `cut` / `dribble` avec waypoints passe par un remap basé sur
   *  la courbure (ralentit dans les virages serrés). Absent ou
   *  `enabled: false` → sampling linéaire legacy strict. */
  velocityProfileOptions?: PlaybackVelocityProfileOptions,
): PlaybackTrajectory {
  const cur = steps[stepIdx];
  const next = steps[stepIdx + 1];
  // Fallback "idle" : lerp linéaire entre la position au step source et au step
  // suivant. Si on garde uniquement cur.off (legacy), l'attaquant SANS annotation
  // reste figé jusqu'au boundary et SNAPPE de la totalité du delta en une frame
  // (bug f435/436 du Screen Lab : O2 sautait 141 px à la dernière frame
  // de la transition vers son nouvel emplacement).
  const idleStart = cur.off[playerId];
  const idleEnd = next ? next.off[playerId] : idleStart;
  const idleAt = (t: number): Point => lerp(idleStart, idleEnd ?? idleStart, t);
  if (stepIdx + 1 >= steps.length) {
    return { position: { ...idleStart }, movementType: 'idle', isScreening: false };
  }

  // Sélection de l'annotation active : on regarde l'annotation sur step idxA
  // (par défaut) ET sur step idxA+1 (au cas où elle ait tStart < 0 et déborde
  // dans la transition courante). On choisit celle dont la fenêtre temporelle
  // contient le globalT courant.
  const globalT = stepIdx + Math.max(0, Math.min(1, localT));
  type Candidate = { ann: Annotation; absStart: number; absEnd: number };
  const candidates: Candidate[] = [];
  const segmentStart = cur.off[playerId];
  for (const checkIdx of [stepIdx, stepIdx + 1]) {
    if (checkIdx < 0 || checkIdx >= steps.length) continue;
    for (const a of findMovementAnnotations(steps[checkIdx], playerId)) {
      // B.4 — résolution unifiée des bornes temporelles. Sans
      // getStepDurationSec → fallback fractions legacy.
      const stepDurSec = getStepDurationSec ? getStepDurationSec(checkIdx) : 1;
      const { tStart: tSraw, tEnd: tEraw } = resolveAnnotationTiming(a, stepDurSec);
      const absStart = checkIdx + tSraw;
      const absEnd = checkIdx + tEraw;
      // Ne garder que si la fenêtre chevauche la transition courante [stepIdx, stepIdx+1]
      if (absEnd <= stepIdx || absStart >= stepIdx + 1) continue;
      // Filtre cohérence : annotation périmée placée sur le step de
      // destination du déplacement (convention de plusieurs générateurs).
      // Si le joueur est déjà à `ann.to` ET que `ann.from` est ailleurs,
      // l'annotation décrit un mouvement déjà effectué — la re-jouer
      // produirait un rubber-band. Voir `ANNOTATION_STALE_TO_TOLERANCE_PX`.
      if (segmentStart) {
        const dToX = a.to.x - segmentStart.x;
        const dToY = a.to.y - segmentStart.y;
        const dFromX = a.from.x - segmentStart.x;
        const dFromY = a.from.y - segmentStart.y;
        const atTo = Math.hypot(dToX, dToY) <= ANNOTATION_STALE_TO_TOLERANCE_PX;
        const fromMatch = Math.hypot(dFromX, dFromY) <= ANNOTATION_STALE_TO_TOLERANCE_PX;
        if (atTo && !fromMatch) continue;
      }
      candidates.push({ ann: a, absStart, absEnd });
    }
  }

  if (candidates.length === 0) {
    return { position: idleAt(Math.max(0, Math.min(1, localT))), movementType: 'idle', isScreening: false,
      route: { path: [idleStart, idleEnd ?? idleStart], progress: Math.max(0, Math.min(1, localT)) } };
  }

  const active = candidates
    .filter((c) => globalT >= c.absStart && globalT <= c.absEnd)
    .sort((a, b) => {
      const startDelta = b.absStart - a.absStart;
      if (Math.abs(startDelta) > 1e-6) return startDelta;
      return movementPriority(b.ann.type) - movementPriority(a.ann.type);
    })[0];
  let chosen: Candidate;
  let actionT: number;
  if (active) {
    chosen = active;
    actionT = (globalT - active.absStart) / Math.max(0.001, active.absEnd - active.absStart);
  } else {
    // Pas dans la fenêtre active : on prend la candidate la plus pertinente
    // (la première par absStart) et on snap aux extrémités.
    chosen = candidates.sort((a, b) => {
      const startDelta = a.absStart - b.absStart;
      if (Math.abs(startDelta) > 1e-6) return startDelta;
      return movementPriority(b.ann.type) - movementPriority(a.ann.type);
    })[0];
    if (globalT < chosen.absStart) actionT = 0;
    else actionT = 1;
  }
  const ann = chosen.ann;
  if (ann.sprint) {
    actionT = actionT >= 0.6 ? 1.0 : actionT / 0.6;
  }

  const hasWaypoints = !!ann.waypoints && ann.waypoints.length > 0;
  if (ann.type === 'cut') {
    let position: Point;
    let routePath = annotationPolyline(ann);
    let routeProgress = actionT;
    if (hasWaypoints) {
      let path = annotationPolyline(ann);
      // Phy.O V3 V2 — choix de côté du cut : si le défenseur matché est du côté
      // trigger, le path est miroité autour de from→to (le cut part de l'autre
      // côté). Endpoints préservés. Indépendant du profil de vitesse.
      let flipApplied = false;
      if (ann.flipSideIfDefenderOn) {
        const flipDefPos = velocityProfileOptions?.flipDefenderFor?.(playerId);
        const flip = maybeFlipCutPath(path, ann.from, ann.to, ann.flipSideIfDefenderOn, flipDefPos);
        path = flip.path;
        flipApplied = flip.flipped;
      }
      let s = actionT;
      const startFromStandstill = stepIdx === 0 || findMovementAnnotations(steps[stepIdx - 1], playerId).length === 0;
      const endAtStandstill = stepIdx + 1 >= steps.length - 1 || findMovementAnnotations(steps[stepIdx + 1], playerId).length === 0;
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        const obstacles = velocityProfileOptions.obstaclesFor?.(playerId) ?? [];
        const matchedDefenderPos = velocityProfileOptions.matchedDefenderFor?.(playerId);
        const postFeinteBoost = !!velocityProfileOptions.postFeinteBoost;
        s = getOrBuildProfile(
          ann, path, tier, obstacles, matchedDefenderPos, postFeinteBoost,
          velocityProfileOptions.durationSec,
          velocityProfileOptions.accelerationEnabled,
          velocityProfileOptions.acceleration,
          startFromStandstill,
          endAtStandstill,
          flipApplied,
        ).remap(actionT);
      }
      routePath = path;
      routeProgress = s;
      position = samplePolyline(path, s);

      // Moment/Centrifugal Drift
      if (velocityProfileOptions?.momentumEnabled) {
        const eps = 0.02;
        const sPrev = Math.max(0, s - eps);
        const sNext = Math.min(1, s + eps);
        const p0 = samplePolyline(path, sPrev);
        const p1 = position;
        const p2 = samplePolyline(path, sNext);

        const dx1 = p1.x - p0.x;
        const dy1 = p1.y - p0.y;
        const len1 = Math.hypot(dx1, dy1);

        const dx2 = p2.x - p1.x;
        const dy2 = p2.y - p1.y;
        const len2 = Math.hypot(dx2, dy2);

        if (len1 > 1e-3 && len2 > 1e-3) {
          const u1x = dx1 / len1;
          const u1y = dy1 / len1;
          const u2x = dx2 / len2;
          const u2y = dy2 / len2;

          const dx = u2x - u1x;
          const dy = u2y - u1y;

          // Outward drift
          const driftDirX = -dx;
          const driftDirY = -dy;

          const lengthM = pxToMeters(polylineLength(path));
          const duration = velocityProfileOptions.durationSec ?? 2.0;
          const vReal = lengthM / duration;
          const vReal2 = vReal * vReal;

          // s * (1 - s) * 4 to normalize max damping to 1.0 at s=0.5
          const damping = s * (1 - s) * 4;

          const coeff = velocityProfileOptions.momentum ?? 0.15;
          const driftM_x = coeff * driftDirX * vReal2 * damping;
          const driftM_y = coeff * driftDirY * vReal2 * damping;

          position.x += metersToPx(driftM_x);
          position.y += metersToPx(driftM_y);
        }
      }
    } else {
      position = lerp(ann.from, ann.to, actionT);
    }
    return { position, movementType: 'cut', isScreening: false, route: { path: routePath, progress: routeProgress } };
  }
  if (ann.type === 'dribble') {
    let position: Point;
    let routePath = annotationPolyline(ann);
    let routeProgress = actionT;
    if (hasWaypoints) {
      const path = annotationPolyline(ann);
      let s = actionT;
      const startFromStandstill = stepIdx === 0 || findMovementAnnotations(steps[stepIdx - 1], playerId).length === 0;
      const endAtStandstill = stepIdx + 1 >= steps.length - 1 || findMovementAnnotations(steps[stepIdx + 1], playerId).length === 0;
      if (velocityProfileOptions?.enabled) {
        const tier = velocityProfileOptions.tierFor?.(playerId);
        const obstacles = velocityProfileOptions.obstaclesFor?.(playerId) ?? [];
        const matchedDefenderPos = velocityProfileOptions.matchedDefenderFor?.(playerId);
        const postFeinteBoost = !!velocityProfileOptions.postFeinteBoost;
        s = getOrBuildProfile(
          ann, path, tier, obstacles, matchedDefenderPos, postFeinteBoost,
          velocityProfileOptions.durationSec,
          velocityProfileOptions.accelerationEnabled,
          velocityProfileOptions.acceleration,
          startFromStandstill,
          endAtStandstill,
        ).remap(actionT);
      }
      routePath = path;
      routeProgress = s;
      position = samplePolyline(path, s);

      // Moment/Centrifugal Drift
      if (velocityProfileOptions?.momentumEnabled) {
        const eps = 0.02;
        const sPrev = Math.max(0, s - eps);
        const sNext = Math.min(1, s + eps);
        const p0 = samplePolyline(path, sPrev);
        const p1 = position;
        const p2 = samplePolyline(path, sNext);

        const dx1 = p1.x - p0.x;
        const dy1 = p1.y - p0.y;
        const len1 = Math.hypot(dx1, dy1);

        const dx2 = p2.x - p1.x;
        const dy2 = p2.y - p1.y;
        const len2 = Math.hypot(dx2, dy2);

        if (len1 > 1e-3 && len2 > 1e-3) {
          const u1x = dx1 / len1;
          const u1y = dy1 / len1;
          const u2x = dx2 / len2;
          const u2y = dy2 / len2;

          const dx = u2x - u1x;
          const dy = u2y - u1y;

          // Outward drift
          const driftDirX = -dx;
          const driftDirY = -dy;

          const lengthM = pxToMeters(polylineLength(path));
          const duration = velocityProfileOptions.durationSec ?? 2.0;
          const vReal = lengthM / duration;
          const vReal2 = vReal * vReal;

          // s * (1 - s) * 4 to normalize max damping to 1.0 at s=0.5
          const damping = s * (1 - s) * 4;

          const coeff = velocityProfileOptions.momentum ?? 0.15;
          const driftM_x = coeff * driftDirX * vReal2 * damping;
          const driftM_y = coeff * driftDirY * vReal2 * damping;

          position.x += metersToPx(driftM_x);
          position.y += metersToPx(driftM_y);
        }
      }
    } else {
      position = lerp(ann.from, ann.to, actionT);
    }
    return { position, movementType: 'dribble', isScreening: false, route: { path: routePath, progress: routeProgress } };
  }
  if (ann.type === 'screen') {
    if (actionT < SCREEN_SET_FRACTION) {
      const moveT = actionT / SCREEN_SET_FRACTION;
      const position = hasWaypoints
        ? samplePolyline(annotationPolyline(ann), moveT)
        : lerp(ann.from, ann.to, moveT);
      return { position, movementType: 'screen', isScreening: false };
    }
    return { position: { ...ann.to }, movementType: 'screen', isScreening: true };
  }
  return { position: idleAt(Math.max(0, Math.min(1, localT))), movementType: 'idle', isScreening: false,
      route: { path: [idleStart, idleEnd ?? idleStart], progress: Math.max(0, Math.min(1, localT)) } };
}
