import { describe, it, expect } from 'vitest';
import { pickWeakSideAnchor } from '@/lib/logic/defense/pickWeakSideAnchor';
import type { AppState, AttackerPositions, Matchups, DefenderId } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

const HOOP = { x: 300, y: 75 };

// Ballon côté droit (carrier O1 à droite). Weak-side = gauche (x < 300).
const off: AttackerPositions = {
  O1: { x: 450, y: 400 }, // porteur, strong-side droit
  O2: { x: 480, y: 250 }, // strong-side
  O3: { x: 120, y: 250 }, // weak-side haut
  O4: { x: 150, y: 130 }, // weak-side bas (proche panier) ← ancre auto attendue
  O5: { x: 400, y: 130 }, // strong-side bas
};
const matchups: Matchups = { D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5' };
const defenderIds: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
const rules = {} as Record<DefenderId, { weakSideAnchor?: boolean }>;

describe('pickWeakSideAnchor', () => {
  it('auto : choisit le défenseur weak-side le plus bas (D4 sur O4)', () => {
    const anchor = pickWeakSideAnchor(off, 'O1', matchups, defenderIds, HOOP, rules);
    expect(anchor).toBe('D4');
  });

  it('override manuel prime : D3 marqué weakSideAnchor → D3', () => {
    const r = { D3: { weakSideAnchor: true } } as typeof rules;
    const anchor = pickWeakSideAnchor(off, 'O1', matchups, defenderIds, HOOP, r);
    expect(anchor).toBe('D3');
  });

  it("exclut le carrierDef (D1) même s'il est weak-side", () => {
    // Porteur déplacé côté gauche → D1 serait weak-side, mais c'est le carrierDef.
    const offLeft = { ...off, O1: { x: 150, y: 400 } };
    const anchor = pickWeakSideAnchor(offLeft, 'O1', matchups, defenderIds, HOOP, rules);
    expect(anchor).not.toBe('D1');
  });

  it('retourne null si aucun défenseur weak-side (tous strong-side)', () => {
    const allRight: AttackerPositions = {
      O1: { x: 450, y: 400 }, O2: { x: 480, y: 250 }, O3: { x: 460, y: 250 },
      O4: { x: 440, y: 130 }, O5: { x: 400, y: 130 },
    };
    const anchor = pickWeakSideAnchor(allRight, 'O1', matchups, defenderIds, HOOP, rules);
    expect(anchor).toBeNull();
  });
});

function makeAnchorState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    weakSideAnchorEnabled: enabled || undefined,
    steps: [
      {
        ...s0.steps[0],
        // Porteur O1 côté droit, O4 weak-side bas (ancre attendue).
        off: {
          O1: { x: 450, y: 400 }, O2: { x: 480, y: 250 }, O3: { x: 120, y: 250 },
          O4: { x: 150, y: 180 }, O5: { x: 400, y: 130 },
        },
        ballCarrier: 'O1',
      },
    ],
  };
}

describe('weakSideAnchorLayer — intégration', () => {
  it('désactivé par défaut → aucun flag weakSideAnchor', () => {
    const def = effectiveDefensePositions(makeAnchorState(false), 0);
    expect(Object.values(def).some((d) => d.weakSideAnchor)).toBe(false);
  });

  it('activé → D4 (low weak-side) reçoit le flag et est enfoncé vers la raquette', () => {
    const defOff = effectiveDefensePositions(makeAnchorState(false), 0);
    const defOn = effectiveDefensePositions(makeAnchorState(true), 0);
    expect(defOn.D4.weakSideAnchor).toBe(true);
    // L'ancre est plus proche du panier qu'en sag passif.
    const hoop = { x: 300, y: 75 };
    const dOn = Math.hypot(defOn.D4.x - hoop.x, defOn.D4.y - hoop.y);
    const dOff = Math.hypot(defOff.D4.x - hoop.x, defOff.D4.y - hoop.y);
    expect(dOn).toBeLessThan(dOff);
  });

  it('INVARIANT clearance : ancre ne crée pas de superposition (≥ 34px)', () => {
    const def = effectiveDefensePositions(makeAnchorState(true), 0);
    const ids = Object.keys(def);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = def[ids[i] as keyof typeof def];
        const b = def[ids[j] as keyof typeof def];
        if (a.matchedTo === b.matchedTo) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(33.9);
      }
    }
  });
});
