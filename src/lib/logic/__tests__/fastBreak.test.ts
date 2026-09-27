import { describe, it, expect } from 'vitest';
import { buildFastBreakSteps, selectOutletReceiver } from '@/lib/logic/fastBreak';
import type { AppState, AttackerId, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';
import { distance } from '@/lib/logic/geometry';

/** State avec un step de rebond défensif : la défense (D) a sécurisé le ballon,
 *  D3 rebondeur. defenseOverrides = positions de l'équipe qui rebondit. */
function reboundState(): AppState {
  const s0 = makeInitialState();
  const off: AttackerPositions = {
    O1: { x: 300, y: 300 }, O2: { x: 200, y: 250 }, O3: { x: 400, y: 250 },
    O4: { x: 240, y: 140 }, O5: { x: 360, y: 140 },
  };
  const def: DefenderPositions = {
    D1: { x: 300, y: 200 }, D2: { x: 180, y: 180 }, D3: { x: 300, y: 110 },
    D4: { x: 230, y: 130 }, D5: { x: 370, y: 130 },
  };
  return {
    ...s0,
    playerCount: 5,
    steps: [{
      off, ballCarrier: 'O1', annotations: [],
      defenseOverrides: def, rebounder: 'D3', reboundType: 'defensive',
    }],
    activeStep: 0,
  };
}

describe('selectOutletReceiver', () => {
  it('choisit l’attaquant le plus proche du rebondeur (hors lui)', () => {
    const off: AttackerPositions = {
      O1: { x: 300, y: 110 }, O2: { x: 320, y: 120 }, O3: { x: 500, y: 400 },
      O4: { x: 240, y: 130 }, O5: { x: 360, y: 130 },
    };
    expect(selectOutletReceiver(off, 'O1', ['O1', 'O2', 'O3', 'O4', 'O5'])).toBe('O2');
  });
});

describe('buildFastBreakSteps', () => {
  it('rebond non défensif → null', () => {
    const s = reboundState();
    s.steps[0] = { ...s.steps[0], reboundType: 'offensive' };
    expect(buildFastBreakSteps(s, 0)).toBeNull();
  });

  it('produit 2 steps (outlet + sprint)', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    expect(r).not.toBeNull();
    expect(r.outletStep.label).toBe('Outlet');
    expect(r.sprintStep.label).toBe('Sprint couloirs');
  });

  it('le ballon part au receveur de l’outlet et le conserve au sprint', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    expect(r.outletStep.ballCarrier).toBe(r.sprintStep.ballCarrier);
    expect(r.outletStep.ballCarrier).not.toBe('O3'); // pas le rebondeur (D3→O3)
  });

  it('le sprint envoie le ballon au milieu et les ailes aux extrêmes, vers HOOP_OPPOSITE', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    const off = r.sprintStep.off;
    const ball = r.sprintStep.ballCarrier as AttackerId;
    expect(off[ball].x).toBe(300);
    expect(off[ball].y).toBeGreaterThan(700); // vers le panier opposé
    const xs = (['O1', 'O2', 'O3', 'O4', 'O5'] as AttackerId[]).map((id) => off[id].x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(110); // une aile gauche
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(490); // une aile droite
  });

  it('repli défensif : calculé par le moteur (pas de ligne figée)', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    expect(r.sprintStep.transitionDefense).toBe(true);
    expect(r.sprintStep.defenseOverrides).toBeUndefined();
    // L'outlet garde le point de départ (les tireurs où ils étaient).
    expect(r.outletStep.defenseOverrides).toBeDefined();
  });

  it('clearance respectée entre attaquants du sprint', () => {
    const r = buildFastBreakSteps(reboundState(), 0)!;
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        expect(distance(r.sprintStep.off[ids[i]], r.sprintStep.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });
});
