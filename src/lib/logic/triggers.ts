import type {
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
  triggers: DefenseTriggers
): DetectedTriggers {
  const carrier = off[ballCarrier];
  if (!carrier) {
    return { drive: false, post: false, paint: false, any: false };
  }

  const d2hoop = distHoop(carrier);

  let drive: boolean;
  if (triggers.drive && prevOff && prevOff[ballCarrier]) {
    const prevD2hoop = distHoop(prevOff[ballCarrier]);
    drive = prevD2hoop - d2hoop > 25 && d2hoop < 250;
  } else {
    drive = triggers.drive && d2hoop < 180 && carrier.y < 320;
  }

  let post: boolean;
  if (triggers.post) {
    const lateralOff = Math.abs(carrier.x - HOOP.x);
    const inLowPost = lateralOff > 80 && lateralOff < 160
      && carrier.y > HOOP.y + 45 && carrier.y < 220;
    if (prevOff && prevOff[ballCarrier]) {
      const delta = distance(carrier, prevOff[ballCarrier]);
      post = inLowPost && delta < 30;
    } else {
      post = inLowPost;
    }
  } else {
    post = false;
  }

  const paint = triggers.paint && inPaint(carrier);

  return { drive, post, paint, any: drive || post || paint };
}
