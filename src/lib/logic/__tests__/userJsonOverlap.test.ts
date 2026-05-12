// Reproduction exacte du fichier systeme_basket-10.json — vérifier que
// AUCUNE paire ne se chevauche aux steps 0 ET 1.
import { describe, expect, it } from 'vitest';
import { makeInitialState } from '@/lib/data/initial';
import { effectiveDefensePositions } from '@/lib/logic/engine';
import type { AppState, AttackerPositions } from '@/lib/types';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

const off0: AttackerPositions = {
  O1: { x: 391, y: 448 },
  O2: { x: 130, y: 380 },
  O3: { x: 470, y: 380 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};
const off1: AttackerPositions = {
  O1: { x: 548.7914428710938, y: 373.2449035644531 },
  O2: { x: 130, y: 380 },
  O3: { x: 399.4250183105469, y: 410.4540100097656 },
  O4: { x: 220, y: 230 },
  O5: { x: 380, y: 230 },
};

const allDefIds = ['D1', 'D2', 'D3', 'D4', 'D5'] as const;
const allOffIds = ['O1', 'O2', 'O3', 'O4', 'O5'] as const;

function makeState(): AppState {
  const s0 = makeInitialState();
  return {
    ...s0,
    steps: [
      {
        off: off0,
        ballCarrier: 'O1',
        annotations: [
          {
            type: 'screen', fromId: 'O3', toId: null,
            from: { x: 470, y: 380 },
            to: { x: 399.4250183105469, y: 410.4540100097656 },
            phase: 'end',
          } as any,
          {
            type: 'dribble', fromId: 'O1', toId: null,
            from: { x: 391, y: 448 },
            to: { x: 548.7914428710938, y: 373.2449035644531 },
            phase: 'end',
          } as any,
        ],
      },
      {
        off: off1,
        ballCarrier: 'O1',
        annotations: [],
      },
    ],
    activeStep: 0,
    defenseInitial: {
      D1: { x: 300, y: 380 }, D2: { x: 170, y: 310 }, D3: { x: 430, y: 310 },
      D4: { x: 240, y: 160 }, D5: { x: 360, y: 160 },
    },
    rules: {
      D1: { helpPct: 20, priority: 'man', vsCarrier: 'coller', maxSpeed: 145 } as any,
      D2: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', maxSpeed: 130 } as any,
      D3: { helpPct: 50, priority: 'paint', vsCarrier: 'coller', maxSpeed: 110 } as any,
      D4: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper', maxSpeed: 90 } as any,
      D5: { helpPct: 75, priority: 'paint', vsCarrier: 'bumper', maxSpeed: 75 } as any,
    },
    screenRule: 'hedge',
    screenRadius: 35,
    closeoutBoost: 1.4,
    denyAggressiveness: 0.45,
  };
}

async function checkFrameAt(localT: number): Promise<string[]> {
  const { resolveFrameAt } = await import('@/lib/logic/playback/frameResolver');
  const state = makeState();
  // t = step fractionnaire ; localT entre step 0 et step 1 ⇒ t = localT.
  const frame = resolveFrameAt(state, localT);
  if (!frame) {
    throw new Error(`frame null à t=${localT}`);
  }
  const violations: string[] = [];

  // A ↔ A
  for (let i = 0; i < allOffIds.length; i++) {
    for (let j = i + 1; j < allOffIds.length; j++) {
      const a = frame.off[allOffIds[i]];
      const b = frame.off[allOffIds[j]];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < PLAYER_MIN_CLEARANCE_PX - 0.5) {
        violations.push(`t=${localT.toFixed(2)} ${allOffIds[i]} ↔ ${allOffIds[j]} = ${d.toFixed(1)}px`);
      }
    }
  }
  // D ↔ O (toutes paires)
  allDefIds.forEach((dId) => {
    allOffIds.forEach((oId) => {
      const dPos = frame.defPos[dId];
      const oPos = frame.off[oId];
      const d = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
      if (d < PLAYER_MIN_CLEARANCE_PX - 0.5) {
        violations.push(`t=${localT.toFixed(2)} ${dId}(match=${dPos.matchedTo}) ↔ ${oId} = ${d.toFixed(1)}px`);
      }
    });
  });
  // D ↔ D
  for (let i = 0; i < allDefIds.length; i++) {
    for (let j = i + 1; j < allDefIds.length; j++) {
      const a = frame.defPos[allDefIds[i]];
      const b = frame.defPos[allDefIds[j]];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < PLAYER_MIN_CLEARANCE_PX - 0.5) {
        violations.push(`t=${localT.toFixed(2)} ${allDefIds[i]} ↔ ${allDefIds[j]} = ${d.toFixed(1)}px`);
      }
    }
  }
  return violations;
}

describe('USER FILE — systeme_basket-10.json (overlap diagnostic)', () => {
  [0, 1].forEach((stepIdx) => {
    it(`step ${stepIdx} — toutes les paires ≥ ${PLAYER_MIN_CLEARANCE_PX} px`, () => {
      const state = makeState();
      const def = effectiveDefensePositions(state, stepIdx);
      const off = stepIdx === 0 ? off0 : off1;

      const violations: string[] = [];

      // D ↔ O (matched ou non)
      allDefIds.forEach((dId) => {
        allOffIds.forEach((oId) => {
          const d = def[dId];
          const o = off[oId];
          const dist = Math.hypot(d.x - o.x, d.y - o.y);
          if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
            violations.push(`${dId}(match=${d.matchedTo}) ↔ ${oId} = ${dist.toFixed(1)}px`);
          }
        });
      });

      // D ↔ D
      for (let i = 0; i < allDefIds.length; i++) {
        for (let j = i + 1; j < allDefIds.length; j++) {
          const a = def[allDefIds[i]];
          const b = def[allDefIds[j]];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
            violations.push(`${allDefIds[i]} ↔ ${allDefIds[j]} = ${dist.toFixed(1)}px`);
          }
        }
      }

      // A ↔ A
      for (let i = 0; i < allOffIds.length; i++) {
        for (let j = i + 1; j < allOffIds.length; j++) {
          const a = off[allOffIds[i]];
          const b = off[allOffIds[j]];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < PLAYER_MIN_CLEARANCE_PX - 0.5) {
            violations.push(`${allOffIds[i]} ↔ ${allOffIds[j]} = ${dist.toFixed(1)}px`);
          }
        }
      }

      if (violations.length > 0) {
        console.log(`STEP ${stepIdx} VIOLATIONS :`);
        violations.forEach((v) => console.log(`  - ${v}`));
        console.log('Positions :');
        allDefIds.forEach((id) => console.log(`  ${id} = (${def[id].x.toFixed(1)}, ${def[id].y.toFixed(1)}) match=${def[id].matchedTo}`));
        allOffIds.forEach((id) => console.log(`  ${id} = (${off[id].x.toFixed(1)}, ${off[id].y.toFixed(1)})`));
      }
      expect(violations).toEqual([]);
    });
  });

  // PLAYBACK : on échantillonne 61 instants (frame par frame sur une lecture
  // 60fps) entre step 0 et step 1. L'overlap O1 ↔ O3 se produit autour de
  // t ≈ 0.35 sans le fix (trajectoires qui se croisent).
  // Le user a signalé f14/60 (t≈0.233) ; on couvre exhaustivement la grille.
  const samples = Array.from({ length: 61 }, (_, i) => i / 60);
  samples.forEach((t) => {
    it(`playback t=${t.toFixed(2)} — toutes les paires ≥ ${PLAYER_MIN_CLEARANCE_PX} px`, async () => {
      const violations = await checkFrameAt(t);
      if (violations.length > 0) {
        console.log(`VIOLATIONS t=${t}:`);
        violations.forEach((v) => console.log(`  ${v}`));
      }
      expect(violations).toEqual([]);
    });
  });
});
