import { describe, it, expect } from 'vitest';
import type { Step, AttackerPositions, AttackerId } from '@/lib/types';
import { attackerTrajectoryAt } from '../playbackTrajectory';

const ZERO: AttackerPositions = {
  O1: { x: 0, y: 0 }, O2: { x: 100, y: 0 }, O3: { x: 200, y: 0 },
  O4: { x: 300, y: 0 }, O5: { x: 400, y: 0 },
};
function step(off: Partial<AttackerPositions>, anns = []): Step {
  return { off: { ...ZERO, ...off } as AttackerPositions, ballCarrier: 'O1', annotations: anns };
}

describe('attackerTrajectoryAt', () => {
  it('aucune annotation : position constante = Step[N].off[player]', () => {
    const steps = [step({ O1: { x: 10, y: 20 } } as Partial<AttackerPositions>), step({ O1: { x: 10, y: 20 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.5);
    expect(r.position).toEqual({ x: 10, y: 20 });
    expect(r.movementType).toBe('idle');
    expect(r.isScreening).toBe(false);
  });

  it('cut : interpolation linéaire au mid-point', () => {
    const ann = { type: 'cut' as const, fromId: 'O2' as AttackerId, from: { x: 100, y: 0 }, to: { x: 200, y: 100 } };
    const steps = [step({}, [ann] as any), step({ O2: { x: 200, y: 100 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O2', 0.5);
    expect(r.position.x).toBeCloseTo(150, 5);
    expect(r.position.y).toBeCloseTo(50, 5);
    expect(r.movementType).toBe('cut');
  });

  it('dribble sans waypoints : ligne droite from → to (wave purement visuelle)', () => {
    const ann = { type: 'dribble' as const, fromId: 'O1' as AttackerId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const steps = [step({}, [ann] as any), step({ O1: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.25);
    expect(r.position.x).toBeCloseTo(25, 5);
    expect(r.position.y).toBeCloseTo(0, 5);
    expect(r.movementType).toBe('dribble');
  });

  it('dribble avec waypoints : suit la polyline tracée par l\'utilisateur', () => {
    const ann = {
      type: 'dribble' as const,
      fromId: 'O1' as AttackerId,
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      waypoints: [{ x: 50, y: 50 }],
    };
    const steps = [step({}, [ann] as any), step({ O1: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.5);
    expect(r.position.y).toBeGreaterThan(0);
    expect(r.movementType).toBe('dribble');
  });

  it('screen : à localT=0.5, position = to ; isScreening=true', () => {
    const ann = { type: 'screen' as const, fromId: 'O5' as AttackerId, from: { x: 400, y: 0 }, to: { x: 250, y: 100 } };
    const steps = [step({}, [ann] as any), step({ O5: { x: 250, y: 100 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O5', 0.5);
    expect(r.position).toEqual({ x: 250, y: 100 });
    expect(r.isScreening).toBe(true);
  });

  it('screen : à localT=0.25 (avant mi-segment), interpole à mi-chemin de A→B', () => {
    const ann = { type: 'screen' as const, fromId: 'O5' as AttackerId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const steps = [step({}, [ann] as any), step({ O5: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O5', 0.25);
    expect(r.position.x).toBeCloseTo(50, 5);
    expect(r.isScreening).toBe(false);
  });

  it('screen : à localT=0.75, pinned en to ; isScreening=true', () => {
    const ann = { type: 'screen' as const, fromId: 'O5' as AttackerId, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const steps = [step({}, [ann] as any), step({ O5: { x: 100, y: 0 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O5', 0.75);
    expect(r.position).toEqual({ x: 100, y: 0 });
    expect(r.isScreening).toBe(true);
  });

  it('dernier step (pas de Step[N+1]) : position figée', () => {
    const steps = [step({ O1: { x: 50, y: 50 } } as Partial<AttackerPositions>)];
    const r = attackerTrajectoryAt(steps, 0, 'O1', 0.5);
    expect(r.position).toEqual({ x: 50, y: 50 });
    expect(r.movementType).toBe('idle');
  });
});
