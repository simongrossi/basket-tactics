import { describe, it, expect } from 'vitest';
import type { Matchups } from '@/lib/types';
import {
  applyDriveContainmentLayer,
  CONTAINMENT_MAX_SHIFT_PX,
} from '@/lib/logic/defense/driveContainmentLayer';
import type { DefenderTarget } from '@/lib/logic/defense/types';
import type { DefenseFrameContext } from '@/lib/logic/defense/context';

const hoop = { x: 250, y: 90 };

function makeCtx(over: Partial<DefenseFrameContext>): DefenseFrameContext {
  return {
    state: { driveContainmentEnabled: true, defenseMaxSpeed: 10 },
    off: { O1: { x: 250, y: 400 } },
    ballCarrier: 'O1',
    carrierPos: { x: 250, y: 400 },
    defenderIds: ['D1', 'D2'],
    prevOff: { O1: { x: 250, y: 450 } },
    hoop,
    ...over,
  } as any;
}

function carrierDef(x: number, y: number): DefenderTarget {
  return { x, y, isCarrierDefender: true, matchedTo: 'O1' } as any;
}

describe('applyDriveContainmentLayer', () => {
  it('CONTAINMENT_MAX_SHIFT_PX exporté', () => {
    expect(CONTAINMENT_MAX_SHIFT_PX).toBe(8);
  });

  it('flag off → no-op (positions inchangées)', () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(285, 330),
      D2: { x: 100, y: 380, isCarrierDefender: false, matchedTo: 'O2' } as any,
    };
    const before = JSON.parse(JSON.stringify(positions));
    applyDriveContainmentLayer(
      positions as any,
      {} as Matchups,
      makeCtx({ state: { driveContainmentEnabled: false, defenseMaxSpeed: 10 } as any }),
    );
    expect(positions).toEqual(before);
  });

  it('flag on + contained → carrierDef nudgé vers containPoint, ≤ cap', () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(285, 330),
    };
    const startX = positions.D1.x;
    const startY = positions.D1.y;
    applyDriveContainmentLayer(positions as any, {} as Matchups, makeCtx({}));
    const shift = Math.hypot(positions.D1.x - startX, positions.D1.y - startY);
    expect(shift).toBeGreaterThan(0);
    expect(shift).toBeLessThanOrEqual(CONTAINMENT_MAX_SHIFT_PX + 1e-6);
  });

  it('flag on + beaten (défenseur loin derrière) → carrierDef inchangé', () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(250, 470),
    };
    const before = { ...positions.D1 };
    applyDriveContainmentLayer(positions as any, {} as Matchups, makeCtx({}));
    expect(positions.D1.x).toBeCloseTo(before.x);
    expect(positions.D1.y).toBeCloseTo(before.y);
  });

  it("n'altère que le défenseur du porteur", () => {
    const positions: Record<string, DefenderTarget> = {
      D1: carrierDef(285, 330),
      D2: { x: 100, y: 380, isCarrierDefender: false, matchedTo: 'O2' } as any,
    };
    const d2Before = { ...positions.D2 };
    applyDriveContainmentLayer(positions as any, {} as Matchups, makeCtx({}));
    expect(positions.D2).toEqual(d2Before);
  });
});
