import { describe, it, expect } from 'vitest';
import type { AppState } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';

function makeReleaseState(enabled: boolean): AppState {
  const s0 = makeInitialState();
  const baseOff = { ...s0.steps[0].off };
  return {
    ...s0,
    screenRule: 'blitz',
    blitzReleaseEnabled: enabled || undefined,
    steps: [
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 380 } },
        ballCarrier: 'O1',
        forcedScreener: 'O5',
      },
      {
        ...s0.steps[0],
        off: { ...baseOff, O5: { x: 305, y: 300 } },
        ballCarrier: 'O3', // ballon ressort
      },
    ],
  };
}

describe('blitzReleaseLayer — intégration', () => {
  it('désactivé par défaut → aucun flag blitzRecovering', () => {
    const def = effectiveDefensePositions(makeReleaseState(false), 1);
    expect(Object.values(def).some((d) => d.blitzRecovering)).toBe(false);
  });

  it('activé → 2 défenseurs blitzRecovering, screenerDef récupère le roller O5', () => {
    const def = effectiveDefensePositions(makeReleaseState(true), 1);
    const recovering = Object.entries(def).filter(([, d]) => d.blitzRecovering);
    expect(recovering.length).toBe(2);
    // Le screenerDef (D5, qui défendait O5) est matché au roller O5.
    const screenerDef = recovering.find(([, d]) => d.matchedTo === 'O5');
    expect(screenerDef).toBeDefined();
  });

  it('INVARIANT clearance : relâche ne crée pas de superposition (≥ 34px)', () => {
    const def = effectiveDefensePositions(makeReleaseState(true), 1);
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
