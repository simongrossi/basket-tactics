// Tests CVT 2b — Couche d'influence (interpose vers les lignes de passe).

import { describe, expect, it } from 'vitest';
import type { Matchups } from '@/lib/types';
import { applyInfluenceLayer, INTERPOSE_MAX_SHIFT_PX } from '@/lib/logic/defense/influenceLayer';
import type { DefenderTarget } from '@/lib/logic/defense/types';
import type { DefenseFrameContext } from '@/lib/logic/defense/context';

describe('applyInfluenceLayer', () => {
  it('INTERPOSE_MAX_SHIFT_PX exporté pour configuration', () => {
    expect(INTERPOSE_MAX_SHIFT_PX).toBe(5);
  });

  it('applique un shift vers la ligne de passe', () => {
    const positions: Record<string, DefenderTarget> = {
      D2: { x: 130, y: 410, orientation: 0, facing: 'ball' } as any
    };
    const matchups: Matchups = {
      D2: 'O2',
    } as any;
    const ctx: DefenseFrameContext = {
      off: {
        O1: { x: 300, y: 480 }, // porteur
        O2: { x: 100, y: 380 }, // son homme
      },
      ballCarrier: 'O1',
      carrierPos: { x: 300, y: 480 },
      defenderIds: ['D2'],
    } as any;

    applyInfluenceLayer(positions as any, matchups, ctx);

    // Le shift d'interpose déplace D2 légèrement vers la ligne O1-O2.
    // Ligne O1-O2 : y = 380 + 0.5 * (x - 100).
    // Pour x = 130, y sur la ligne est 380 + 15 = 395.
    // Position initiale D2 : (130, 410). Il est en dessous (y=410 > 395).
    // Donc il devrait être tiré vers le haut (y diminuant vers 395).
    expect(positions.D2.y).toBeLessThan(410);
    expect(positions.D2.y).toBeGreaterThanOrEqual(410 - INTERPOSE_MAX_SHIFT_PX);
  });
});
