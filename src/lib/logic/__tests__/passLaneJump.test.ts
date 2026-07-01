import { describe, it, expect } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { passLaneJumpOffset } from '@/lib/logic/passLaneJump';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';
import { pointToSegmentDistance } from '@/lib/logic/geometry';

// ---------------------------------------------------------------------------
// P2.1 — helper pur : offset de jump vers la ligne de passe pendant le vol
// ---------------------------------------------------------------------------

describe('passLaneJumpOffset — helper pur', () => {
  // Ligne de passe horizontale : passeur (400,400) → receveur (100,400).
  const passer = { x: 400, y: 400 };
  const receiver = { x: 100, y: 400 };

  it('nul aux bornes du vol (t=0 et t=1) → endpoints moteur intacts', () => {
    const defender = { x: 250, y: 370 };
    expect(passLaneJumpOffset({ defender, passer, receiver, localT: 0 })).toEqual({ x: 0, y: 0 });
    expect(passLaneJumpOffset({ defender, passer, receiver, localT: 1 })).toEqual({ x: 0, y: 0 });
  });

  it('maximal à mi-vol, dirigé vers la ligne', () => {
    const defender = { x: 250, y: 370 }; // 30 px au-dessus de la ligne
    const off = passLaneJumpOffset({ defender, passer, receiver, localT: 0.5 });
    expect(off.x).toBeCloseTo(0, 6);
    expect(off.y).toBeGreaterThan(0); // vers y=400
    // Falloff proximité : 12 × (1 - 30/60) = 6 px
    expect(off.y).toBeCloseTo(6, 6);
  });

  it('plus fort à mi-vol qu\'en début de vol (enveloppe sin)', () => {
    const defender = { x: 250, y: 370 };
    const early = passLaneJumpOffset({ defender, passer, receiver, localT: 0.15 });
    const mid = passLaneJumpOffset({ defender, passer, receiver, localT: 0.5 });
    expect(Math.hypot(mid.x, mid.y)).toBeGreaterThan(Math.hypot(early.x, early.y));
  });

  it('hors rayon (≥ 60 px de la ligne) → nul', () => {
    const defender = { x: 250, y: 320 }; // 80 px
    expect(passLaneJumpOffset({ defender, passer, receiver, localT: 0.5 })).toEqual({ x: 0, y: 0 });
  });

  it('ne traverse jamais la ligne : défenseur à 4 px → atterrit sur la ligne, pas au-delà', () => {
    const defender = { x: 250, y: 396 };
    const off = passLaneJumpOffset({ defender, passer, receiver, localT: 0.5 });
    expect(off.y).toBeCloseTo(4, 6);
  });

  it('défenseur déjà sur la ligne → nul', () => {
    const defender = { x: 250, y: 400 };
    expect(passLaneJumpOffset({ defender, passer, receiver, localT: 0.5 })).toEqual({ x: 0, y: 0 });
  });

  it('segment dégénéré (passeur = receveur) → nul', () => {
    const defender = { x: 250, y: 370 };
    expect(passLaneJumpOffset({ defender, passer, receiver: passer, localT: 0.5 })).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// P2.1 — intégration resolveFrameAt (flag state.jumpPassingLanesEnabled)
// ---------------------------------------------------------------------------

const off0: AttackerPositions = {
  O1: { x: 400, y: 400 }, // passeur
  O2: { x: 100, y: 400 }, // futur receveur
  O3: { x: 250, y: 470 }, // son défenseur sera proche de la ligne de passe
  O4: { x: 480, y: 200 },
  O5: { x: 150, y: 180 },
};

function makePassState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  const defenseInitial: DefenderPositions = {
    D1: { x: 400, y: 360 },
    D2: { x: 140, y: 360 },
    D3: { x: 250, y: 430 }, // ~30 px de la ligne y=400
    D4: { x: 460, y: 240 },
    D5: { x: 170, y: 220 },
  };
  return {
    ...s0,
    jumpPassingLanesEnabled: enabled || undefined,
    defenseInitial,
    triggers: { drive: false, post: false, paint: false, trap: false },
    steps: [
      { ...s0.steps[0], off: off0, ballCarrier: 'O1' },
      { ...s0.steps[0], off: off0, ballCarrier: 'O2' }, // passe O1 → O2
    ],
  };
}

function laneDist(p: { x: number; y: number }): number {
  return pointToSegmentDistance(p, off0.O1, off0.O2);
}

describe('jumpPassingLanesEnabled — intégration resolveFrameAt', () => {
  it('à mi-vol, un défenseur proche de la ligne saute dedans (flag on vs off)', () => {
    const base = resolveFrameAt(makePassState(false), 0.5)!;
    const jump = resolveFrameAt(makePassState(true), 0.5)!;
    expect(laneDist(jump.defPos.D3)).toBeLessThan(laneDist(base.defPos.D3));
  });

  it('aux bornes du segment, positions identiques (endpoints intacts)', () => {
    for (const t of [0, 1]) {
      const base = resolveFrameAt(makePassState(false), t)!;
      const jump = resolveFrameAt(makePassState(true), t)!;
      expect(jump.defPos.D3.x).toBeCloseTo(base.defPos.D3.x, 9);
      expect(jump.defPos.D3.y).toBeCloseTo(base.defPos.D3.y, 9);
    }
  });

  it('le défenseur du receveur (closeout) ne dévie pas vers la ligne', () => {
    const base = resolveFrameAt(makePassState(false), 0.5)!;
    const jump = resolveFrameAt(makePassState(true), 0.5)!;
    expect(jump.defPos.D2.x).toBeCloseTo(base.defPos.D2.x, 6);
    expect(jump.defPos.D2.y).toBeCloseTo(base.defPos.D2.y, 6);
  });

  it('sans passe (carrier stable), flag on = flag off', () => {
    const noPass = (enabled: boolean): AppState => {
      const s = makePassState(enabled);
      return { ...s, steps: [s.steps[0], { ...s.steps[1], ballCarrier: 'O1' }] };
    };
    const base = resolveFrameAt(noPass(false), 0.5)!;
    const jump = resolveFrameAt(noPass(true), 0.5)!;
    expect(jump.defPos.D3.x).toBeCloseTo(base.defPos.D3.x, 9);
    expect(jump.defPos.D3.y).toBeCloseTo(base.defPos.D3.y, 9);
  });
});
