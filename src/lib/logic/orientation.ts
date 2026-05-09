import type { Point, OffBallStance, CarrierBehavior } from '../types';

// =============================================================================
// INVARIANTS ANATOMIQUES — INVIOLABLES
// =============================================================================
// Les fonctions de ce module retournent body + gaze + 2 cibles d'armes.
// Toute modification doit respecter ces 3 règles métier :
//
//   1. **Le regard NE PEUT JAMAIS sortir du CHAMP DE VISION.** Le cône de
//      vision frontal a 120° d'ouverture (60° de chaque côté). Le `gaze` est
//      donc contraint à `|gaze - body| ≤ 60°` (modulo 360°). Si l'auto-calcul
//      produit un gaze hors de ce cône, il est CLAMPÉ à l'angle limite. Le
//      triangle pointeur (visible dans Player.tsx) reste ainsi forcément à
//      l'intérieur du cône de champ de vision rendu par FieldOfViewOverlay.
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
 *    ±90° de `bodyOrientation` (cf. invariant #1). C'est l'angle utilisé
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
  /** Verrouillage du regard sur une cible dynamique. Prioritaire sur la
   *  logique stance. Le clamp anatomique ±60° reste appliqué après. */
  gazeLock?: 'opponent' | 'ball-carrier' | 'both';
  /** Delta legacy du curseur orientation (±45°), ajouté au body auto. */
  manualDelta?: number;
}

export function computeDefenderOrientation(input: DefenderOrientationInput): OrientationResult {
  const { defenderPos, manPos, ballPos, isCarrierDefender, stance, vsCarrier, pnrRole, manualBody, gazeLock, manualDelta } = input;

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
  // 2. Body orientation — milieu de la ligne d'épaule (perpendiculaire à
  //    l'axe homme-ballon en open stance ; vers homme en on-ball).
  // ---------------------------------------------------------------------------
  let bodyAuto: number;
  if (isCarrierDefender) {
    // Corps face au porteur.
    bodyAuto = angleFromNorth(defenderPos, manPos);
  } else if (stance === 'fronting') {
    // Fronting : dos au ballon, face à l'homme.
    bodyAuto = angleFromNorth(defenderPos, manPos);
  } else {
    // Open stance / default : corps orienté vers le midpoint homme-ballon.
    const midpoint: Point = {
      x: (manPos.x + ballPos.x) / 2,
      y: (manPos.y + ballPos.y) / 2,
    };
    bodyAuto = angleFromNorth(defenderPos, midpoint);
  }

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
  let gazeTarget: Point;
  if (gazeLock === 'opponent') {
    gazeTarget = manPos;
  } else if (gazeLock === 'ball-carrier') {
    gazeTarget = ballPos;
  } else if (gazeLock === 'both') {
    gazeTarget = { x: (manPos.x + ballPos.x) / 2, y: (manPos.y + ballPos.y) / 2 };
  } else if (isCarrierDefender) {
    gazeTarget = manPos;
  } else if (pnrRole === 'tag' || pnrRole === 'x-out' || pnrRole === 'stunt') {
    gazeTarget = ballPos;
  } else if (stance === 'fronting' || stance === 'deny-3q' || stance === 'stunt') {
    gazeTarget = ballPos;
  } else {
    // Sag : regard sur le ballon (priorité 1) — le head-on-swivel se matérialise
    // par la posture du corps (open stance) qui voit déjà l'homme.
    gazeTarget = ballPos;
  }

  const gazeAuto = angleFromNorth(defenderPos, gazeTarget);
  // Invariant #1 : clamp gaze à ±60° du corps (cohérent avec FOV overlay).
  const gazeOrientation = clampGazeToFrontal(gazeAuto, bodyOrientation);
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
  /** Override manuel — regard. Sera clampé à ±60° du body effectif. */
  manualGaze?: number;
}

const DRIBBLE_THRESHOLD_PX = 30;

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

/** Normalise un angle dans [0, 360). */
function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Différence signée d'angles dans [-180, 180]. */
function angleDiff(a: number, b: number): number {
  return ((a - b) % 360 + 540) % 360 - 180;
}

/**
 * INVARIANT #1 — clamp gaze au CÔNE DE CHAMP DE VISION (±60° du body).
 * Le triangle de regard ne peut s'orienter QUE dans la zone visuellement
 * couverte par les cônes (FieldOfViewOverlay). Si |gaze - body| > 60°,
 * ramène à la limite du cône (body ± 60°).
 */
const FOV_HALF_ANGLE_DEG = 60;
function clampGazeToFrontal(gaze: number, body: number): number {
  const diff = angleDiff(gaze, body);
  if (diff > FOV_HALF_ANGLE_DEG) return normalizeAngle(body + FOV_HALF_ANGLE_DEG);
  if (diff < -FOV_HALF_ANGLE_DEG) return normalizeAngle(body - FOV_HALF_ANGLE_DEG);
  return normalizeAngle(gaze);
}

/**
 * INVARIANT #2 — clamp une cible de bras au demi-cercle frontal du corps.
 * Si l'angle vers la cible est > 90° du body, on projette la cible sur la
 * ligne limite frontale, en gardant la même distance au joueur.
 */
function clampArmTargetToFrontal(target: Point, joueur: Point, bodyDeg: number): Point {
  const angleToTarget = angleFromNorth(joueur, target);
  const diff = angleDiff(angleToTarget, bodyDeg);
  if (Math.abs(diff) <= 90) return target;
  // Sinon : on ramène à la limite frontale, distance préservée.
  const dx = target.x - joueur.x;
  const dy = target.y - joueur.y;
  const dist = Math.hypot(dx, dy);
  const limitDeg = diff > 0 ? bodyDeg + 90 : bodyDeg - 90;
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
 */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  const diff = angleDiff(b, a);
  return a + diff * t;
}
