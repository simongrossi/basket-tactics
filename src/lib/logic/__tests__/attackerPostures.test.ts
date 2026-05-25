import { describe, expect, it } from 'vitest';
import type { AnnotationType, Step, Point } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { computeAttackerVisuals } from '@/lib/logic/attackerVisuals';
import { getDefenseHoop } from '@/lib/logic/engine';
import { computeDefenderOrientation } from '@/lib/logic/orientation';
import { recomputeDefenseFrameOrientations } from '@/lib/logic/defense/frameAdjust';

function angleFromNorth(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  while (a < 0) a += 360;
  while (a >= 360) a -= 360;
  return a;
}

describe('Postures, Poses et Attention Visuelle', () => {
  describe('Chantier B & E — Attacker Postures (Shooter & Post-shot recovery)', () => {
    it('role = shooter quand le porteur prend un tir, orientant corps/regard/bras vers le panier', () => {
      const s = makeInitialState();
      const carrier = s.steps[0].ballCarrier; // 'O1'
      const startPos = { x: 300, y: 350 };
      const hoop = getDefenseHoop(s); // panier défendu

      // Configurer un tir sur le step 0
      const step0: Step = {
        ...s.steps[0],
        ballCarrier: carrier,
        off: { ...s.steps[0].off, [carrier]: startPos },
        shotOutcome: 'missed',
      };

      const state = { ...s, steps: [step0] };
      const visuals = computeAttackerVisuals(state, 0);
      const visualCarrier = visuals[carrier];

      // Vérifier que le corps et le regard font face au panier
      const expectedAngle = angleFromNorth(startPos, hoop);
      expect(visualCarrier.orientation).toBeCloseTo(expectedAngle, 1);
      expect(visualCarrier.gazeOrientation).toBeCloseTo(expectedAngle, 1);

      // Les bras pointent vers le panier (les bras sont clampés mais orientés vers hoop)
      // La direction du bras par rapport à l'épaule
      const armBallAngle = angleFromNorth(startPos, visualCarrier.armBallSide);
      const armManAngle = angleFromNorth(startPos, visualCarrier.armManSide);
      expect(armBallAngle).toBeCloseTo(expectedAngle, 1);
      expect(armManAngle).toBeCloseTo(expectedAngle, 1);
    });

    it('role = post-shot-recovery au step suivant, gardant les bras/regard vers le panier', () => {
      const s = makeInitialState();
      const carrier = s.steps[0].ballCarrier; // 'O1'
      const startPos = { x: 300, y: 350 };
      const nextPos = { x: 310, y: 340 };
      const hoop = getDefenseHoop(s);

      // Step 0 : Tir
      const step0: Step = {
        ...s.steps[0],
        ballCarrier: carrier,
        off: { ...s.steps[0].off, [carrier]: startPos },
        shotOutcome: 'missed',
      };

      // Step 1 : Rebond/reprise (recovery post-shot)
      const step1: Step = {
        ...s.steps[0],
        ballCarrier: 'O2', // La balle a été tirée au step précédent, donc O1 n'est plus carrier
        off: { ...s.steps[0].off, [carrier]: nextPos },
      };

      const state = { ...s, steps: [step0, step1] };
      const visuals = computeAttackerVisuals(state, 1);
      const visualCarrier = visuals[carrier];

      // Le corps et le regard restent orientés vers le panier
      const expectedAngle = angleFromNorth(nextPos, hoop);
      expect(visualCarrier.orientation).toBeCloseTo(expectedAngle, 1);
      expect(visualCarrier.gazeOrientation).toBeCloseTo(expectedAngle, 1);

      // Les bras restent pointés vers le panier (follow-through)
      const armBallAngle = angleFromNorth(nextPos, visualCarrier.armBallSide);
      const armManAngle = angleFromNorth(nextPos, visualCarrier.armManSide);
      expect(armBallAngle).toBeCloseTo(expectedAngle, 1);
      expect(armManAngle).toBeCloseTo(expectedAngle, 1);
    });
  });

  describe('Chantier A — Transition defense repli', () => {
    it('computeDefenderOrientation oriente le corps en biais à 45° vers le panier en repli de transition', () => {
      // Panier défendu (hoop) = (300, 75)
      const hoop = { x: 300, y: 75 };
      // Le défenseur se déplace vers le panier (de (300, 400) à (300, 300))
      const prevPos = { x: 300, y: 400 };
      const defenderPos = { x: 300, y: 300 };
      // Le ballon est plus haut sur le terrain (au-delà du défenseur par rapport à la baseline, ex: y = 500)
      const ballPos = { x: 400, y: 500 };
      const manPos = { x: 200, y: 300 };

      const result = computeDefenderOrientation({
        defenderPos,
        manPos,
        ballPos,
        isCarrierDefender: false,
        stance: 'sag',
        hoop,
        prevPos,
      });

      // L'angle vers le panier est 0° (nord).
      // Le ballon est à l'est (x=400 > 300, y=500 > 300).
      // Donc le corps doit être orienté en biais de 45° pour pouvoir garder un regard sur le ballon (ouvert).
      // L'angle panier est 0°. Le ballon est au sud-est (angle > 90°).
      // Le corps doit s'orienter à hoopAngle + sideSign * 45 = 0 + 1 * 45 = 45° (nord-est) ou -45° (nord-ouest) selon la différence d'angle.
      // Voyons la formule :
      // hoopAngle = angleFromNorth(defenderPos, hoop) = 0
      // ballAngle = angleFromNorth(defenderPos, ballPos) = 180 - atan2(100, 200) ≈ 153°
      // diff = angleDiff(ballAngle, hoopAngle) = angleDiff(153, 0) = 153 >= 0 -> sideSign = 1
      // return normalizeAngle(hoopAngle + sideSign * 45) = 45°
      expect(result.bodyOrientation).toBeCloseTo(45, 1);
    });

    it('recomputeDefenseFrameOrientations propage prevPositions pour le calcul du repli', () => {
      const s = makeInitialState();
      const hoop = getDefenseHoop(s);
      const defenderId = 'D1';

      // Configurer des positions pour D1 qui recule vers le hoop
      const prevPositions = {
        [defenderId]: { x: 300, y: 400 },
      };
      
      const off: import('@/lib/types').AttackerPositions = {
        O1: { x: 400, y: 500 }, // Ballon plus haut
        O2: { x: 100, y: 100 },
        O3: { x: 500, y: 100 },
        O4: { x: 100, y: 700 },
        O5: { x: 500, y: 700 },
      };

      const defPos = {
        [defenderId]: {
          x: 300,
          y: 300,
          late: false,
          isCarrierDefender: false,
          matchedTo: 'O1',
          orientation: 0,
          gazeOrientation: 0,
        },
      } as any;

      recomputeDefenseFrameOrientations(s, off, 'O1', defPos, prevPositions);

      // Le corps doit être orienté en biais à cause du repli
      expect(defPos[defenderId].orientation).toBeCloseTo(45, 1);
    });
  });
});
