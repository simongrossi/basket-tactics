import type { Point, DefenderRule, DetectedTriggers, AttackerPositions, AttackerId } from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';

export interface HelpResult {
  target: Point;
  helpFactor: number;
}

export function computeHelpTarget(
  manPos: Point,
  rule: DefenderRule,
  triggers: DetectedTriggers,
  carrierPos: Point,
  attPos: Point,
  ballSide: -1 | 0 | 1,
  allOff?: AttackerPositions
): HelpResult {
  const myAttSide = Math.sign(attPos.x - HOOP.x) || 0;

  if (!triggers.any || rule.helpPct === 0) {
    if (rule.helpPct > 0 && ballSide !== 0 && myAttSide !== 0 && myAttSide !== ballSide) {
      const sagFactor = (rule.helpPct / 100) * 0.5;
      const aim = {
        x: (manPos.x + HOOP.x) / 2 + (carrierPos.x - HOOP.x) * 0.2,
        y: Math.max((manPos.y + HOOP.y) / 2 + 20, carrierPos.y - 30),
      };
      return {
        target: {
          x: manPos.x + (aim.x - manPos.x) * sagFactor,
          y: manPos.y + (aim.y - manPos.y) * sagFactor,
        },
        helpFactor: sagFactor,
      };
    }
    return { target: manPos, helpFactor: 0 };
  }

  let sideFactor: number;
  if (ballSide === 0 || myAttSide === 0) sideFactor = 0.7;
  else if (myAttSide !== ballSide) sideFactor = 1;
  else sideFactor = 0.35;

  const helpFactor = (rule.helpPct / 100) * sideFactor;

  let aim: Point;
  switch (rule.priority) {
    case 'paint': {
      const leftBlock: Point = { x: HOOP.x - 70, y: HOOP.y + 80 };
      const rightBlock: Point = { x: HOOP.x + 70, y: HOOP.y + 80 };
      let bestDist = Infinity;
      let blockTarget: Point | null = null;
      if (allOff) {
        (Object.entries(allOff) as [AttackerId, Point][]).forEach(([, p]) => {
          const dL = distance(p, leftBlock);
          const dR = distance(p, rightBlock);
          const d = Math.min(dL, dR);
          if (d < bestDist && d < 120) {
            bestDist = d;
            blockTarget = p;
          }
        });
      }
      aim = blockTarget ?? { x: HOOP.x, y: HOOP.y + 60 };
      break;
    }
    case 'passlane': {
      const mx = (attPos.x + carrierPos.x) / 2;
      const my = (attPos.y + carrierPos.y) / 2;
      aim = {
        x: mx + (carrierPos.x - mx) * 0.3,
        y: my + (carrierPos.y - my) * 0.3,
      };
      break;
    }
    case 'man':
      aim = manPos;
      break;
  }

  return {
    target: {
      x: manPos.x + (aim.x - manPos.x) * helpFactor,
      y: manPos.y + (aim.y - manPos.y) * helpFactor,
    },
    helpFactor,
  };
}
