import type {
  Point,
  AttackerPositions,
  AttackerId,
  DefenseTriggers,
  DetectedTriggers,
} from '../types';
import { HOOP } from '../data/court';
import { distHoop, inPaint, distance } from './geometry';

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
    drive = triggers.drive && d2hoop < 180 && yIntoCourt < 245;
  }

  let post: boolean;
  if (triggers.post) {
    const lateralOff = Math.abs(carrier.x - hoop.x);
    const inLowPost = lateralOff > 80 && lateralOff < 160
      && yIntoCourt > 45 && yIntoCourt < 145;
    if (prevOff && prevOff[ballCarrier]) {
      const delta = distance(carrier, prevOff[ballCarrier]);
      post = inLowPost && delta < 30;
    } else {
      post = inLowPost;
    }
  } else {
    post = false;
  }

  const paint = triggers.paint && inPaint(carrier, hoop);

  return { drive, post, paint, any: drive || post || paint };
}
