import type { Point, OffBallStance, CarrierBehavior } from '../types';

/**
 * Calcul d'orientation/facing pour un défenseur. Pure function.
 *
 * `facing` = point que le défenseur regarde (sert au triangle pointeur).
 * `orientationDeg` = angle horaire depuis le NORD (haut, y négatif), à
 *  appliquer à la rotation des bras FIBA. 0° = face haut, +90° = face droite,
 *  +180° = face bas, etc.
 *
 * Règles :
 *  - on-ball (`isCarrierDefender`) → facing = porteur (manPos = ballPos).
 *    Modulation `vsCarrier` : topside +30° (oriente l'épaule vers la baseline
 *    pour fermer le middle), baseline -30° (oriente vers le centre pour fermer
 *    la baseline).
 *  - off-ball stance fronting / deny-3q / stunt → facing = ballPos (denial).
 *  - off-ball sag / behind / undefined → facing = midpoint(manPos, ballPos)
 *    (head-on-swivel : voit son homme et le ballon).
 *  - `manualDelta` : delta ajouté à l'auto, clampé à [-45°, +45°] pour
 *    garantir qu'aucun réglage manuel ne produise une posture aberrante
 *    (un fronting tournant le dos au ballon, par ex.).
 */
export interface DefenderOrientationInput {
  defenderPos: Point;
  manPos: Point;
  ballPos: Point;
  isCarrierDefender?: boolean;
  stance?: OffBallStance;
  vsCarrier?: CarrierBehavior;
  pnrRole?: 'tag' | 'x-out' | 'stunt';
  /** Delta manuel (degrés). Clampé à [-45, +45]. */
  manualDelta?: number;
}

export function computeDefenderOrientation(
  input: DefenderOrientationInput
): { orientationDeg: number; facing: Point } {
  const { defenderPos, manPos, ballPos, isCarrierDefender, stance, vsCarrier, pnrRole, manualDelta } = input;

  let facing: Point;
  if (isCarrierDefender) {
    facing = manPos;
  } else if (pnrRole === 'tag' || pnrRole === 'x-out' || pnrRole === 'stunt') {
    // En rotation PnR, le défenseur regarde l'aire de menace (ballon = bonne approx).
    facing = ballPos;
  } else if (stance === 'fronting' || stance === 'deny-3q' || stance === 'stunt') {
    facing = ballPos;
  } else {
    // sag / behind / undefined : head-on-swivel
    facing = { x: (manPos.x + ballPos.x) / 2, y: (manPos.y + ballPos.y) / 2 };
  }

  const baseAngle = angleFromNorth(defenderPos, facing);

  let stanceMod = 0;
  if (isCarrierDefender) {
    if (vsCarrier === 'topside') stanceMod += 30;
    else if (vsCarrier === 'baseline') stanceMod -= 30;
  }

  const delta = clampDelta(manualDelta);

  return {
    orientationDeg: baseAngle + stanceMod + delta,
    facing,
  };
}

/**
 * Calcul d'orientation/facing pour un attaquant. Pure function.
 *
 *  - role='carrier' (porteur) → facing = panier.
 *  - role='passer' (passe en cours) → facing = receveur.
 *  - role='cutter' (coupe vers une destination) → facing = nextPos.
 *  - role='screener' (poseur d'écran) → facing = défenseur ciblé,
 *    orientation = perpendiculaire à la ligne screener→défenseur (corps de
 *    profil pour bloquer la trajectoire).
 *  - défaut → facing = ballon (regarder le jeu).
 */
export type AttackerRole = 'carrier' | 'passer' | 'cutter' | 'screener' | 'idle';

export interface AttackerOrientationInput {
  attackerPos: Point;
  role: AttackerRole;
  ballPos: Point;
  hoop: Point;
  receiverPos?: Point;
  nextPos?: Point;
  screenTargetDefPos?: Point;
}

export function computeAttackerOrientation(
  input: AttackerOrientationInput
): { orientationDeg: number; facing: Point } {
  const { attackerPos, role, ballPos, hoop, receiverPos, nextPos, screenTargetDefPos } = input;

  let facing: Point;
  let perpendicular = false;
  if (role === 'carrier') {
    facing = hoop;
  } else if (role === 'passer' && receiverPos) {
    facing = receiverPos;
  } else if (role === 'cutter' && nextPos) {
    facing = nextPos;
  } else if (role === 'screener' && screenTargetDefPos) {
    facing = screenTargetDefPos;
    perpendicular = true;
  } else {
    facing = ballPos;
  }

  let orientationDeg = angleFromNorth(attackerPos, facing);
  if (perpendicular) orientationDeg += 90;

  return { orientationDeg, facing };
}

/**
 * Angle horaire depuis le NORD (haut) entre deux points. Convention SVG :
 * y croît vers le bas, donc "nord" = y négatif. Retour en degrés.
 *  - target au nord (au-dessus) → 0°
 *  - target à l'est (à droite)  → +90°
 *  - target au sud (en-dessous) → ±180°
 *  - target à l'ouest (à gauche) → -90°
 */
function angleFromNorth(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Math.atan2(dx, -dy) : 0 = nord, sens horaire positif.
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function clampDelta(d: number | undefined): number {
  if (!d) return 0;
  return Math.max(-45, Math.min(45, d));
}

/**
 * Lerp angulaire entre deux angles en degrés. Prend le plus court chemin
 * autour du cercle. Utile pour interpoler l'orientation entre deux étapes
 * sans faire un tour complet quand on passe par 0/360.
 */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  let diff = ((b - a) % 360 + 540) % 360 - 180; // [-180, 180]
  return a + diff * t;
}
