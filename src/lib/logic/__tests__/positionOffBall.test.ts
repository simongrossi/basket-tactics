import { describe, it, expect } from 'vitest';
import { computeOffBallPositions, CORNER_BONUS_PX } from '../autoOffense/positionOffBall';
import type { AttackerPositions } from '../../types';

const HOOP = { x: 300, y: 75 };

// Setup : O1 porteur au top, O2-O5 en positions neutres loin des coins.
const baseOff: AttackerPositions = {
  O1: { x: 300, y: 470 },
  O2: { x: 200, y: 380 },
  O3: { x: 400, y: 380 },
  O4: { x: 220, y: 250 },
  O5: { x: 380, y: 250 },
};

describe('computeOffBallPositions — corner preference', () => {
  it('CORNER_BONUS_PX est exporté et vaut 45', () => {
    expect(CORNER_BONUS_PX).toBe(45);
  });

  it('un shooter préfère le corner au wing à spacing équivalent', () => {
    const result = computeOffBallPositions(baseOff, 'O1', HOOP, {
      O1: 'creator', O2: 'shooter', O3: 'slasher', O4: 'rim-roller', O5: 'stretch-big',
    });
    const o2pos = result.find(r => r.id === 'O2')!.pos;
    // Le corner droit est à (547, 80), le corner gauche à (53, 80).
    // O2 (shooter) doit finir dans un des deux coins (x < 90 ou x > 510, y < 120).
    const inCorner = (o2pos.x < 90 || o2pos.x > 510) && o2pos.y < 120;
    expect(inCorner).toBe(true);
  });

  it('un stretch-big préfère aussi le corner', () => {
    const result = computeOffBallPositions(baseOff, 'O1', HOOP, {
      O1: 'creator', O2: 'slasher', O3: 'non-shooter', O4: 'rim-roller', O5: 'stretch-big',
    });
    const o5pos = result.find(r => r.id === 'O5')!.pos;
    const inCorner = (o5pos.x < 90 || o5pos.x > 510) && o5pos.y < 120;
    expect(inCorner).toBe(true);
  });

  it('un non-shooter ne va pas forcément au corner — la fonction tourne sans erreur', () => {
    const result = computeOffBallPositions(baseOff, 'O1', HOOP, {
      O1: 'creator', O2: 'non-shooter', O3: 'slasher', O4: 'rim-roller', O5: 'rim-roller',
    });
    expect(result).toHaveLength(4);
  });
});
