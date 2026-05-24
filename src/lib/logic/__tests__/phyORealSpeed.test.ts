import { describe, it, expect } from 'vitest';
import { getSecondsPerStep, totalDurationSeconds } from '../timecode';
import { buildVelocityProfile } from '../velocityProfile';
import { attackerTrajectoryAt } from '../playbackTrajectory';
import type { AppState, AttackerPositions, AttackerId } from '../../types';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 },
  O2: { x: 100, y: 0 },
  O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 },
  O5: { x: 400, y: 0 },
};

function step(off: Partial<AttackerPositions>, anns = []): any {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier: 'O1', annotations: anns };
}

function mkState(partial: Partial<AppState> = {}): AppState {
  return {
    steps: [
      step({ O1: { x: 0, y: 0 } }),
      step({ O1: { x: 100, y: 0 } }),
    ],
    activeStep: 0,
    playerCount: 5,
    secondsPerStep: undefined,
    ...partial,
  } as AppState;
}

describe('Phy.O and Real Speed Mode', () => {
  describe('Timecode & NBA Sprint Clock', () => {
    it('getSecondsPerStep returns 0.5s when realSpeedMode is true', () => {
      const state = mkState({ realSpeedMode: true });
      expect(getSecondsPerStep(state)).toBe(0.5);
    });

    it('getSecondsPerStep returns 4.0s when realSpeedMode is false', () => {
      const state = mkState({ realSpeedMode: false });
      expect(getSecondsPerStep(state)).toBe(4.0);
    });

    it('totalDurationSeconds computes correctly in realSpeedMode', () => {
      const state = mkState({
        realSpeedMode: true,
        steps: [
          step({ O1: { x: 0, y: 0 } }),
          step({ O1: { x: 100, y: 0 } }),
          step({ O1: { x: 200, y: 0 } }),
        ],
      });
      // 3 steps = 2 transitions. With realSpeedMode: true, each is 0.5s. Total = 1.0s.
      expect(totalDurationSeconds(state)).toBe(1.0);
    });
  });

  describe('Velocity Profile S-Curve & Standstill Bounds', () => {
    it('applies S-curve acceleration constraints', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];
      // When acceleration is disabled, profile is identity
      const profDisabled = buildVelocityProfile(path, {
        accelerationEnabled: false,
      });
      expect(profDisabled.remap(0.25)).toBeCloseTo(0.25, 2);

      // When acceleration is enabled, check that startFromStandstill affects the profile
      const profEnabled = buildVelocityProfile(path, {
        accelerationEnabled: true,
        acceleration: 5.0,
        durationSec: 0.5,
        startFromStandstill: true,
        endAtStandstill: true,
      });

      // At actionT = 0.1 (early phase), velocity starts low, so progress should lag behind identity
      expect(profEnabled.remap(0.1)).toBeLessThan(0.1);
      // At actionT = 0.9 (late phase), it has decel limit, so progress should catch up but endpoints must be exactly 0 and 1
      expect(profEnabled.remap(0)).toBe(0);
      expect(profEnabled.remap(1)).toBeCloseTo(1, 6);
    });

    it('safety floor prevents Division by Zero / NaN', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];
      const profile = buildVelocityProfile(path, {
        accelerationEnabled: true,
        acceleration: 5.0,
        durationSec: 0.5,
        startFromStandstill: true,
        endAtStandstill: true,
      });

      // Checking that no NaN is returned at any step
      for (let t = 0; t <= 10; t++) {
        const s = profile.remap(t / 10);
        expect(s).not.toBeNaN();
        expect(isFinite(s)).toBe(true);
      }
    });
  });

  describe('Centrifugal Drift Boundary Properties', () => {
    it('centrifugal drift is zero at boundaries s=0 and s=1', () => {
      const ann = {
        type: 'cut' as const,
        fromId: 'O1' as AttackerId,
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        waypoints: [{ x: 50, y: 50 }],
      };

      const steps = [
        step({ O1: { x: 0, y: 0 } }, [ann] as any),
        step({ O1: { x: 100, y: 0 } }),
      ];

      const velocityProfileOptions = {
        enabled: true,
        momentumEnabled: true,
        momentum: 0.5,
        durationSec: 0.5,
      };

      // At localT = 0, position must be exactly ann.from (no drift)
      const startTraj = attackerTrajectoryAt(steps, 0, 'O1', 0, undefined, velocityProfileOptions);
      expect(startTraj.position.x).toBeCloseTo(ann.from.x, 5);
      expect(startTraj.position.y).toBeCloseTo(ann.from.y, 5);

      // At localT = 1, position must be exactly ann.to (no drift)
      const endTraj = attackerTrajectoryAt(steps, 0, 'O1', 1, undefined, velocityProfileOptions);
      expect(endTraj.position.x).toBeCloseTo(ann.to.x, 5);
      expect(endTraj.position.y).toBeCloseTo(ann.to.y, 5);

      // In the middle, drift should be non-zero
      const midTraj = attackerTrajectoryAt(steps, 0, 'O1', 0.5, undefined, velocityProfileOptions);
      // Check that it drifted away from the spline path (at s=0.5, spline would be around y=37.5)
      // Drift should move it further down because of centrifugal force (outward)
      expect(midTraj.position.y).not.toBe(0);
    });
  });

  describe('Offensive Sprint Boost Compression', () => {
    it('compresses trajectory timeline into 60% of step duration', () => {
      const ann = {
        type: 'cut' as const,
        fromId: 'O1' as AttackerId,
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        sprint: true,
      };

      const steps = [
        step({ O1: { x: 0, y: 0 } }, [ann] as any),
        step({ O1: { x: 100, y: 0 } }),
      ];

      // At localT = 0.3 (half of 0.6), player should be at 50% of the trajectory
      const tHalf = attackerTrajectoryAt(steps, 0, 'O1', 0.3);
      expect(tHalf.position.x).toBeCloseTo(50, 2);

      // At localT = 0.6, player must have reached the destination
      const tLimit = attackerTrajectoryAt(steps, 0, 'O1', 0.6);
      expect(tLimit.position.x).toBeCloseTo(100, 2);

      // At localT = 0.8, player remains at destination
      const tOver = attackerTrajectoryAt(steps, 0, 'O1', 0.8);
      expect(tOver.position.x).toBeCloseTo(100, 2);
    });
  });
});
