import type {
  Point,
  AttackerPositions,
  AttackerId,
  DefenseTriggers,
  DetectedTriggers,
} from '../types';
import { HOOP } from '../data/court';
import { POST_HOLD_THRESHOLD_PX } from '../constants/gameplay';
import {
  EARLY_DRIVE_FULL_DELTA_PX,
  EARLY_DRIVE_MAX_DIST_PX,
  EARLY_DRIVE_MIN_DELTA_PX,
} from '../data/physics';
import { distHoop, inPaint, distance } from './geometry';

/**
 * P1.4 — Détecte un « drive naissant » : le porteur gagne du terrain vers
 * le panier mais SOUS le seuil du vrai trigger drive (25 px). Retourne une
 * intensité 0..1 (rampe linéaire entre MIN et FULL delta), 0 si le porteur
 * est statique, s'éloigne, n'a pas de step précédent, ou est trop loin du
 * panier pour menacer (> EARLY_DRIVE_MAX_DIST_PX).
 *
 * Consommé par le shrink weak-side (state.weakSideShrinkEnabled) : l'aile
 * opposée se resserre vers la raquette AVANT que l'aide active se déclenche.
 */
export function detectEarlyDrive(
  off: AttackerPositions,
  prevOff: AttackerPositions | null,
  ballCarrier: AttackerId,
  hoop: Point = HOOP
): number {
  const carrier = off[ballCarrier];
  const prevCarrier = prevOff?.[ballCarrier];
  if (!carrier || !prevCarrier) return 0;
  const d2hoop = distHoop(carrier, hoop);
  if (d2hoop >= EARLY_DRIVE_MAX_DIST_PX) return 0;
  const delta = distHoop(prevCarrier, hoop) - d2hoop;
  if (delta <= EARLY_DRIVE_MIN_DELTA_PX) return 0;
  return Math.min(
    1,
    (delta - EARLY_DRIVE_MIN_DELTA_PX) / (EARLY_DRIVE_FULL_DELTA_PX - EARLY_DRIVE_MIN_DELTA_PX)
  );
}

export function detectTriggers(
  off: AttackerPositions,
  prevOff: AttackerPositions | null,
  ballCarrier: AttackerId,
  triggers: DefenseTriggers,
  hoop: Point = HOOP
): DetectedTriggers {
  const carrier = off[ballCarrier];
  if (!carrier) {
    return { drive: false, post: false, paint: false, any: false };
  }

  const d2hoop = distHoop(carrier, hoop);
  // Profondeur dans le terrain depuis le panier de référence : positif si le
  // porteur est "vers le milieu" depuis sa baseline, négatif sinon.
  const intoCourtSign = hoop.y > 540 ? -1 : 1;
  const yIntoCourt = (carrier.y - hoop.y) * intoCourtSign;

  let drive: boolean;
  if (triggers.drive && prevOff && prevOff[ballCarrier]) {
    const prevD2hoop = distHoop(prevOff[ballCarrier], hoop);
    drive = prevD2hoop - d2hoop > 25 && d2hoop < 250;
  } else {
    // Étape 0 (pas de prev) : on déclenche drive dès que le porteur est
    // dans la zone de menace (250px du panier). Permet aux coachs de
    // simuler une menace de pénétration directement sans avoir besoin
    // d'une étape précédente.
    drive = triggers.drive && d2hoop < 250;
  }

  let post: boolean;
  if (triggers.post) {
    const lateralOff = Math.abs(carrier.x - hoop.x);
    const inLowPost = lateralOff > 80 && lateralOff < 160
      && yIntoCourt > 45 && yIntoCourt < 145;
    if (prevOff && prevOff[ballCarrier]) {
      const delta = distance(carrier, prevOff[ballCarrier]);
      post = inLowPost && delta < POST_HOLD_THRESHOLD_PX;
    } else {
      post = inLowPost;
    }
  } else {
    post = false;
  }

  // Paint trigger : raquette stricte OU dans les 80px du panier (couvre
  // les drives qui finissent juste hors raquette, runner, floater, etc.)
  const paint = triggers.paint && (inPaint(carrier, hoop) || d2hoop < 80);

  return { drive, post, paint, any: drive || post || paint };
}
