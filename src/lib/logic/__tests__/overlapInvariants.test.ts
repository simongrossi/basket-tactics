// Invariants stricts d'anti-superposition (règle absolue mai 2026) :
// AUCUN joueur ne peut chevaucher un autre, peu importe :
//   - équipe (attaquant ↔ défenseur, attaquant ↔ attaquant, défenseur ↔ défenseur)
//   - matching (D matché à O ne PEUT PAS se poser sur lui — pas d'exception)
//
// Tous les couples doivent respecter `PLAYER_MIN_CLEARANCE_PX = 34 px`
// (≈ 2 × rayon sprite + 2 px de marge). Cf. docs/PLAYER-CLEARANCE.md.

import { describe, expect, it } from 'vitest';
import { makeInitialState, makeStep } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import { compileScenario } from '@/lib/logic/compileScenario';
import { distance } from '@/lib/logic/geometry';
import type { AppState, AttackerId, AttackerPositions, OffensiveScriptedAction } from '@/lib/types';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

describe('DIAG superposition complète', () => {
  it('scénario user : O3 poseur sur O1 porteur + D4 tag + D5 x-out — vérifier toutes les paires', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 580, y: 460 }, // porteur, coin droit (comme screenshot)
      O2: { x: 280, y: 430 },
      O3: { x: 580, y: 460 }, // poseur EXACTEMENT sur O1 (cas pathologique)
      O4: { x: 380, y: 220 },
      O5: { x: 480, y: 200 }, // dans la zone PnR, peut être roller
    };
    const state: AppState = {
      ...s0,
      steps: [{ ...makeStep(off, 'O1', []), forcedScreener: 'O3' as const }],
      activeStep: 0,
      screenRule: 'hedge',
      tagThenSwitchEnabled: true, // configuration agressive
    };
    const def = effectiveDefensePositions(state, 0);

    // Reconstruit les paires matchups → on autorise SEULEMENT le matched
    // à overlapper son homme.
    const allDefIds = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
    const allOffIds = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;

    // INVARIANT 1 : tout défenseur ↔ TOUT attaquant ≥ clearance.
    // AUCUNE exception, y compris D matché à son O.
    allDefIds.forEach((dId) => {
      const dPos = def[dId];
      allOffIds.forEach((oId) => {
        const oPos = off[oId];
        const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
        if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
          console.log(`OVERLAP : ${dId}(match=${dPos.matchedTo}) ↔ ${oId} = ${dist.toFixed(1)}px`);
        }
        expect(dist, `${dId}(match=${dPos.matchedTo}) ↔ ${oId}`).toBeGreaterThanOrEqual(
          PLAYER_MIN_CLEARANCE_PX - 0.5
        );
      });
    });

    // INVARIANT 2 : tout défenseur ↔ tout autre défenseur ≥ clearance.
    for (let i = 0; i < allDefIds.length; i++) {
      for (let j = i + 1; j < allDefIds.length; j++) {
        const a = def[allDefIds[i]];
        const b = def[allDefIds[j]];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
          console.log(`OVERLAP : ${allDefIds[i]} ↔ ${allDefIds[j]} = ${dist.toFixed(1)}px`);
        }
        expect(dist, `${allDefIds[i]} ↔ ${allDefIds[j]}`).toBeGreaterThanOrEqual(
          PLAYER_MIN_CLEARANCE_PX - 0.5
        );
      }
    }
  });

  it('attaquant↔attaquant : drag O3 sur O1 via moveAttackerInState → O3 repoussé à clearance', async () => {
    const { moveAttackerInState } = await import('@/lib/logic/playerMove');
    const s0 = makeInitialState();
    const o1 = s0.steps[0].off.O1;
    const next = moveAttackerInState(s0, 'O3', { x: o1.x, y: o1.y });
    const o3 = next.steps[0].off.O3;
    const dist = Math.hypot(o3.x - o1.x, o3.y - o1.y);
    expect(dist).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });

  it('édition libre : D5 placé directement sur O3 (non matché) → engine doit le pousser', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 400, y: 400 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const state: AppState = {
      ...s0,
      steps: [{
        ...makeStep(off, 'O1', []),
        defenseOverrides: { D5: { x: 400, y: 400 } }, // D5 PILE sur O3
      }],
      activeStep: 0,
    };
    const def = effectiveDefensePositions(state, 0);
    const distD5_O3 = Math.hypot(def.D5.x - off.O3.x, def.D5.y - off.O3.y);
    console.log(`D5 placé sur O3 (matched=${def.D5.matchedTo}) : dist après engine = ${distD5_O3.toFixed(1)}px`);
    // Règle absolue : même si matched, pas de superposition.
    expect(distD5_O3).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });

  it('override matched : D1 placé pile sur O1 (son homme) → engine pousse à clearance (pas d\'exception coller)', () => {
    const s0 = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 500, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    };
    const state: AppState = {
      ...s0,
      steps: [{
        ...makeStep(off, 'O1', []),
        defenseOverrides: { D1: { x: 300, y: 470 } }, // D1 PILE sur O1 (son matched)
      }],
      activeStep: 0,
    };
    const def = effectiveDefensePositions(state, 0);
    const distD1_O1 = Math.hypot(def.D1.x - off.O1.x, def.D1.y - off.O1.y);
    expect(distD1_O1).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
  });
});

describe('auto-replacement — invariant clearance', () => {
  it('toutes les paires ≥ PLAYER_MIN_CLEARANCE_PX après cascade', () => {
    const initialOff: AttackerPositions = {
      O1: { x: 300, y: 250 }, O2: { x: 480, y: 200 }, O3: { x: 500, y: 320 },
      O4: { x: 510, y: 430 }, O5: { x: 150, y: 320 },
    };
    const cut: OffensiveScriptedAction = {
      kind: 'offensive', id: 'c1', type: 'basket-cut', params: { cutter: 'O2' },
    };
    const steps = compileScenario({
      initialOff, initialBallCarrier: 'O1', actions: [cut], playerCount: 5,
      autoReplacementEnabled: true, autoReplacementDepth: 2,
    });
    const ids: AttackerId[] = ['O1', 'O2', 'O3', 'O4', 'O5'];
    for (const s of steps) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          expect(distance(s.off[ids[i]], s.off[ids[j]])).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 0.5);
        }
      }
    }
  });
});
