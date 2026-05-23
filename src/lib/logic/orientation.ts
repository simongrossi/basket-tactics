import type { Point, OffBallStance, CarrierBehavior, BodyOrientationMode } from '../types';
import { clampGazeToFrontal, resolveDefenderGaze } from './vision';
import { angleDiff, lerpAngleDeg as lerpAngleDegShared, normalizeAngle } from './angles';
import { DRIBBLE_THRESHOLD_PX } from '../constants/gameplay';

// =============================================================================
// INVARIANTS ANATOMIQUES — INVIOLABLES
// =============================================================================
// Les fonctions de ce module retournent body + gaze + 2 cibles d'armes.
// Toute modification doit respecter ces 3 règles métier :
//
//   1. **Le regard NE PEUT JAMAIS partir derrière la tête.** La tête peut
//      pivoter jusqu'à 75° à droite/gauche du corps (`HEAD_TURN_LIMIT_DEG`).
//      Si l'auto-calcul produit un gaze au-delà, il est CLAMPÉ à cette limite.
//      Le cône de champ de vision reste, lui, centré sur `gazeOrientation`.
//
//   2. **Aucun bras ne peut pointer dans le dos.** Pareil : si une cible
//      d'arme tombe derrière le joueur (angle > 90° du corps), on la ramène
//      à un point sur la ligne limite frontale.
//
//   3. **Le porteur de balle (statique) regarde le panier.** En dribble
//      (delta prev→cur > 30 px), il regarde la direction du mouvement.
//      Pas d'exception, pas de stance qui inverse cette règle.
//
// Ces 3 règles priment sur tout autre calcul (overrides manuels inclus).
// =============================================================================

/**
 * Résultat d'un calcul d'orientation joueur.
 *
 *  - `bodyOrientation` : angle horaire du corps depuis le NORD, en degrés.
 *    0° = corps tourné nord, +90° = corps tourné est, ±180° = sud, etc.
 *    Plage 0–360° libre (rotation possible dans tout sens).
 *
 *  - `gazeOrientation` : angle horaire du regard depuis le NORD. CONTRAINT à
 *    ±75° de `bodyOrientation` (cf. invariant #1). C'est l'angle utilisé
 *    pour positionner le triangle pointeur facing.
 *
 *  - `facing` : point géométrique que le joueur regarde (cohérent avec
 *    `gazeOrientation` après clamp).
 *
 *  - `armBallSide` : cible géométrique de la main "côté ballon". En convention
 *    B, c'est ce vers quoi pointe l'extrémité d'un bras (intercepter passe,
 *    bloquer drive, etc. selon rôle). Clampée pour rester dans le demi-cercle
 *    frontal du corps.
 *
 *  - `armManSide` : cible géométrique de la main "côté homme". Symétrique
 *    sémantiquement. Pareil clampée.
 */
export interface OrientationResult {
  bodyOrientation: number;
  gazeOrientation: number;
  facing: Point;
  armBallSide: Point;
  armManSide: Point;
}

const ARM_FRONT_HALF_ANGLE_DEG = 90;

// =============================================================================
// DÉFENSEUR
// =============================================================================

export interface DefenderOrientationInput {
  defenderPos: Point;
  manPos: Point;
  ballPos: Point;
  isCarrierDefender?: boolean;
  stance?: OffBallStance;
  vsCarrier?: CarrierBehavior;
  pnrRole?: 'tag' | 'x-out' | 'stunt';
  /** Override manuel — corps en absolu (0–360°). Si défini, écrase l'auto. */
  manualBody?: number;
  /** Consigne tactique de corps. Écrasée par manualBody si défini. */
  bodyMode?: BodyOrientationMode;
  /** Verrouillage du regard sur une cible dynamique. Prioritaire sur la
   *  logique stance. Le clamp anatomique ±75° reste appliqué après. */
  gazeLock?: 'opponent' | 'ball-carrier' | 'both';
  /** Delta legacy du curseur orientation (±45°), ajouté au body auto. */
  manualDelta?: number;
}

export function computeDefenderOrientation(input: DefenderOrientationInput): OrientationResult {
  const { defenderPos, manPos, ballPos, isCarrierDefender, stance, vsCarrier, pnrRole, manualBody, bodyMode, gazeLock, manualDelta } = input;

  // ---------------------------------------------------------------------------
  // 1. Cibles des bras — par rôle/stance
  // ---------------------------------------------------------------------------
  // Bras "ball-side" = bras orienté vers la menace ballon (intercepter passe,
  // bloquer drive, contestation tir).
  // Bras "man-side" = bras orienté vers l'homme marqué (sentir, contester son
  // mouvement, denial sur cut).
  let armBallSide: Point;
  let armManSide: Point;

  if (isCarrierDefender) {
    // On-ball : les 2 bras vers le porteur (contestation à 2 mains).
    armBallSide = manPos;
    armManSide = manPos;
  } else if (pnrRole === 'tag' || pnrRole === 'x-out' || pnrRole === 'stunt') {
    // Rotation PnR : un bras vers la zone de menace (ballon), l'autre vers
    // l'homme original (recover).
    armBallSide = ballPos;
    armManSide = manPos;
  } else if (stance === 'fronting') {
    // Fronting : les 2 bras vers la ligne de passe homme→ballon (le défenseur
    // se met DANS la ligne, pas à côté).
    const passLine: Point = {
      x: manPos.x + (ballPos.x - manPos.x) * 0.5,
      y: manPos.y + (ballPos.y - manPos.y) * 0.5,
    };
    armBallSide = passLine;
    armManSide = passLine;
  } else if (stance === 'deny-3q' || stance === 'stunt') {
    // Denial : un bras dans la ligne de passe (intercepter), un sur l'homme.
    armBallSide = {
      x: manPos.x + (ballPos.x - manPos.x) * 0.35,
      y: manPos.y + (ballPos.y - manPos.y) * 0.35,
    };
    armManSide = manPos;
  } else {
    // Sag / behind / défaut : open stance — un bras vers ballon, un vers homme.
    armBallSide = ballPos;
    armManSide = manPos;
  }

  // ---------------------------------------------------------------------------
  // 2. Body orientation — logique basket : on-ball en contain, off-ball en
  //    open stance angulaire (ball-you-man), avec biais selon la stance.
  // ---------------------------------------------------------------------------
  let bodyAuto = computeDefenderBodyOrientation({
    defenderPos,
    manPos,
    ballPos,
    isCarrierDefender,
    stance,
    pnrRole,
    bodyMode,
  });

  // Modulation `vsCarrier` legacy pour on-ball (force baseline / topside).
  if (isCarrierDefender) {
    if (vsCarrier === 'topside') bodyAuto += 30;
    else if (vsCarrier === 'baseline') bodyAuto -= 30;
  }

  // Override manuel (corps absolu) ou delta legacy (±45°).
  let bodyOrientation: number;
  if (typeof manualBody === 'number') {
    bodyOrientation = normalizeAngle(manualBody);
  } else {
    bodyOrientation = normalizeAngle(bodyAuto + clampDelta(manualDelta));
  }

  // ---------------------------------------------------------------------------
  // 3. Gaze (regard) — verrouillage explicite > stance auto, puis CLAMP.
  // ---------------------------------------------------------------------------
  const gazeOrientation = resolveDefenderGaze({
    defenderPos,
    manPos,
    ballPos,
    bodyOrientation,
    isCarrierDefender,
    stance,
    pnrRole,
    gazeLock,
  });
  const facing = projectFromAngle(defenderPos, gazeOrientation, 30);

  // ---------------------------------------------------------------------------
  // 4. Invariant #2 : ramener les bras dans le demi-cercle frontal du corps.
  // ---------------------------------------------------------------------------
  return {
    bodyOrientation,
    gazeOrientation,
    facing,
    armBallSide: clampArmTargetToFrontal(armBallSide, defenderPos, bodyOrientation),
    armManSide: clampArmTargetToFrontal(armManSide, defenderPos, bodyOrientation),
  };
}

// =============================================================================
// ATTAQUANT
// =============================================================================

export type AttackerRole = 'carrier' | 'passer' | 'cutter' | 'screener' | 'idle';

export interface AttackerOrientationInput {
  attackerPos: Point;
  role: AttackerRole;
  ballPos: Point;
  hoop: Point;
  receiverPos?: Point;
  nextPos?: Point;
  screenTargetDefPos?: Point;
  /** Position du même attaquant à l'étape précédente, pour détecter le dribble
   *  (carrier qui se déplace > 30 px → orientation dans la direction du
   *  mouvement, pas vers le panier). */
  prevPos?: Point;
  /** Override manuel — corps en absolu (0–360°). Si défini, écrase l'auto. */
  manualBody?: number;
  /** Override manuel — regard. Sera clampé à ±75° du body effectif. */
  manualGaze?: number;
}

export function computeAttackerOrientation(input: AttackerOrientationInput): OrientationResult {
  const { attackerPos, role, ballPos, hoop, receiverPos, nextPos, screenTargetDefPos, prevPos, manualBody, manualGaze } = input;

  // ---------------------------------------------------------------------------
  // 1. Cibles des bras — par rôle.
  // ---------------------------------------------------------------------------
  let armBallSide: Point;
  let armManSide: Point;

  if (role === 'carrier') {
    // Porteur : 2 bras vers le panier (vise) ou vers la direction de dribble.
    const dribbleDir = detectDribbleTarget(attackerPos, prevPos);
    const target = dribbleDir ?? hoop;
    armBallSide = target;
    armManSide = target;
  } else if (role === 'passer' && receiverPos) {
    // Passeur : 2 bras vers le receveur (passe à 2 mains).
    armBallSide = receiverPos;
    armManSide = receiverPos;
  } else if (role === 'cutter' && nextPos) {
    // Coupeur : 2 bras vers la destination (course).
    armBallSide = nextPos;
    armManSide = nextPos;
  } else if (role === 'screener' && screenTargetDefPos) {
    // Poseur d'écran : bras parallèles au corps (ligne d'épaule perpendiculaire
    // à la trajectoire du défenseur ciblé). Les 2 cibles sont aux extrémités
    // de cette ligne d'épaule, calculées plus bas avec body perpendiculaire.
    armBallSide = screenTargetDefPos;
    armManSide = screenTargetDefPos;
  } else {
    // Idle : bras tendus vers le porteur (demande la passe).
    armBallSide = ballPos;
    armManSide = ballPos;
  }

  // ---------------------------------------------------------------------------
  // 2. Body orientation.
  // ---------------------------------------------------------------------------
  let bodyAuto: number;
  if (role === 'carrier') {
    const dribbleDir = detectDribbleTarget(attackerPos, prevPos);
    bodyAuto = angleFromNorth(attackerPos, dribbleDir ?? hoop);
  } else if (role === 'passer' && receiverPos) {
    bodyAuto = angleFromNorth(attackerPos, receiverPos);
  } else if (role === 'cutter' && nextPos) {
    bodyAuto = angleFromNorth(attackerPos, nextPos);
  } else if (role === 'screener' && screenTargetDefPos) {
    // Corps perpendiculaire à la trajectoire du défenseur ciblé.
    bodyAuto = angleFromNorth(attackerPos, screenTargetDefPos) + 90;
  } else {
    bodyAuto = angleFromNorth(attackerPos, ballPos);
  }
  const bodyOrientation = typeof manualBody === 'number'
    ? normalizeAngle(manualBody)
    : normalizeAngle(bodyAuto);

  // ---------------------------------------------------------------------------
  // 3. Gaze + clamp anatomique.
  // ---------------------------------------------------------------------------
  let gazeTarget: Point;
  if (role === 'carrier') {
    const dribbleDir = detectDribbleTarget(attackerPos, prevPos);
    gazeTarget = dribbleDir ?? hoop;
  } else if (role === 'passer' && receiverPos) {
    gazeTarget = receiverPos;
  } else if (role === 'cutter' && nextPos) {
    gazeTarget = nextPos;
  } else if (role === 'screener' && screenTargetDefPos) {
    gazeTarget = screenTargetDefPos;
  } else {
    gazeTarget = ballPos;
  }
  let gazeAuto = angleFromNorth(attackerPos, gazeTarget);
  if (typeof manualGaze === 'number') gazeAuto = normalizeAngle(manualGaze);
  const gazeOrientation = clampGazeToFrontal(gazeAuto, bodyOrientation);
  const facing = projectFromAngle(attackerPos, gazeOrientation, 30);

  return {
    bodyOrientation,
    gazeOrientation,
    facing,
    armBallSide: clampArmTargetToFrontal(armBallSide, attackerPos, bodyOrientation),
    armManSide: clampArmTargetToFrontal(armManSide, attackerPos, bodyOrientation),
  };
}

/**
 * Détecte un dribble : si le porteur s'est déplacé de plus de
 * DRIBBLE_THRESHOLD_PX entre l'étape précédente et la courante, retourne un
 * point extrapolé dans la direction du mouvement (pour orienter body+gaze).
 * Sinon retourne null (porteur statique → orientation par défaut = panier).
 */
function detectDribbleTarget(curPos: Point, prevPos: Point | undefined): Point | null {
  if (!prevPos) return null;
  const dx = curPos.x - prevPos.x;
  const dy = curPos.y - prevPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= DRIBBLE_THRESHOLD_PX) return null;
  // Extrapolation : prochaine position si le dribble continue.
  return { x: curPos.x + dx, y: curPos.y + dy };
}

// =============================================================================
// HELPERS — angles, clamps anatomiques, projection
// =============================================================================

/**
 * Angle horaire depuis le NORD entre deux points (en degrés).
 *  - to au nord  → 0°
 *  - to à l'est  → +90°
 *  - to au sud   → ±180°
 *  - to à l'ouest → -90°
 */
function angleFromNorth(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function computeDefenderBodyOrientation(input: {
  defenderPos: Point;
  manPos: Point;
  ballPos: Point;
  isCarrierDefender?: boolean;
  stance?: OffBallStance;
  pnrRole?: 'tag' | 'x-out' | 'stunt';
  bodyMode?: BodyOrientationMode;
}): number {
  const { defenderPos, manPos, ballPos, isCarrierDefender, stance, pnrRole, bodyMode } = input;
  const manAngle = angleFromNorth(defenderPos, manPos);
  const ballAngle = angleFromNorth(defenderPos, ballPos);

  if (bodyMode && bodyMode !== 'auto') {
    const passLineLength = Math.hypot(manPos.x - ballPos.x, manPos.y - ballPos.y);
    const passAngle = passLineLength < 0.001 ? manAngle : angleFromNorth(ballPos, manPos);
    switch (bodyMode) {
      case 'open':
        return blendAngleDeg(manAngle, ballAngle, 0.5);
      case 'open-weighted': {
        // C.6 — Open stance avec poids CONTINU basé sur les distances.
        // Basket réel : un défenseur regarde plus l'HOMME quand celui-ci
        // est proche (menace immédiate de cut/move), et plus le BALLON
        // quand le ballon est proche (menace de passe). Ratio continu.
        //
        // Calcul :
        //   weightBall = distMan / (distMan + distBall)
        //   - distMan grande → weightBall ↑ (homme loin, regarde ballon)
        //   - distMan petite → weightBall ↓ (homme près, regarde homme)
        //   À distances égales → weightBall = 0.5 (= mode 'open' classique).
        const distMan = Math.hypot(manPos.x - defenderPos.x, manPos.y - defenderPos.y);
        const distBall = Math.hypot(ballPos.x - defenderPos.x, ballPos.y - defenderPos.y);
        const totalDist = distMan + distBall;
        const weightBall = totalDist > 0.001 ? distMan / totalDist : 0.5;
        return blendAngleDeg(manAngle, ballAngle, weightBall);
      }
      case 'face-man':
        return manAngle;
      case 'face-ball':
        return ballAngle;
      case 'pass-lane-flat':
        return passAngle;
      case 'pass-lane-perp':
        return passAngle + 90;
    }
  }

  if (isCarrierDefender) {
    return manAngle;
  }

  if (pnrRole === 'tag' || pnrRole === 'stunt') {
    // Rotation d'aide : épaules franchement côté ballon, sans perdre totalement
    // le recover vers l'homme original.
    return blendAngleDeg(manAngle, ballAngle, 0.75);
  }
  if (pnrRole === 'x-out') {
    // X-out : course de rotation vers le ballon, mais le corps reste un peu
    // plus ouvert pour lire la passe suivante.
    return blendAngleDeg(manAngle, ballAngle, 0.6);
  }

  switch (stance) {
    case 'fronting':
      // Full denial : le défenseur est entre homme et ballon, poitrine vers la
      // passe pour interdire l'entrée. Le contact homme reste via bras/corps.
      return ballAngle;
    case 'deny-3q':
      // 3/4 deny : pied/main dans la ligne de passe, hanches ouvertes.
      return blendAngleDeg(manAngle, ballAngle, 0.65);
    case 'stunt':
      // Fake d'aide : plus proche d'un show vers le ballon que d'un marquage pur.
      return blendAngleDeg(manAngle, ballAngle, 0.7);
    case 'behind':
      // Strictement entre homme et panier : priorité à contenir l'homme.
      return manAngle;
    case 'sag':
    default:
      // Ball-you-man : midpoint angulaire, non biaisé par la distance des cibles.
      return blendAngleDeg(manAngle, ballAngle, 0.5);
  }
}

function blendAngleDeg(a: number, b: number, t: number): number {
  return normalizeAngle(a + angleDiff(b, a) * t);
}

/**
 * INVARIANT #2 — clamp une cible de bras au demi-cercle frontal du corps.
 * Si l'angle vers la cible est > 90° du body, on projette la cible sur la
 * ligne limite frontale, en gardant la même distance au joueur.
 */
function clampArmTargetToFrontal(target: Point, joueur: Point, bodyDeg: number): Point {
  const dx = target.x - joueur.x;
  const dy = target.y - joueur.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return projectFromAngle(joueur, bodyDeg, 1);

  const angleToTarget = angleFromNorth(joueur, target);
  const diff = angleDiff(angleToTarget, bodyDeg);
  if (Math.abs(diff) <= ARM_FRONT_HALF_ANGLE_DEG) return target;
  // Sinon : on ramène à la limite frontale, distance préservée.
  const limitDeg = diff > 0 ? bodyDeg + ARM_FRONT_HALF_ANGLE_DEG : bodyDeg - ARM_FRONT_HALF_ANGLE_DEG;
  return projectFromAngle(joueur, limitDeg, dist);
}

/** Projette un point depuis `from` à `distance` selon `angleDeg` horaire/nord. */
function projectFromAngle(from: Point, angleDeg: number, distance: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: from.x + Math.sin(rad) * distance,
    y: from.y - Math.cos(rad) * distance,
  };
}

/** Clampe le delta legacy d'orientation à [-45, +45]°. */
function clampDelta(d: number | undefined): number {
  if (!d) return 0;
  return Math.max(-45, Math.min(45, d));
}

// =============================================================================
// LERP ANGULAIRE (utilisé par l'animation pour interpoler entre étapes)
// =============================================================================

/**
 * Lerp angulaire entre deux angles en degrés. Prend le plus court chemin
 * autour du cercle. Évite l'effet "rotation à l'envers" en passant 0/360.
 *
 * Réexporté depuis `./angles` pour préserver l'API publique (CourtView et
 * tests historiques importent depuis `orientation`).
 */
export const lerpAngleDeg = lerpAngleDegShared;
