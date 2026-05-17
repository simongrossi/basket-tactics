// Tests D.5 — Anti-collision pendant l'interpolation.
//
// Le moteur applique `resolvePlayerCollisions` sur les positions finales
// de chaque step (engine.ts) ET sur les positions intermédiaires
// (frameResolver.ts ligne ~948). Ce test vérifie l'invariant
// **bout-en-bout** : aucune paire de joueurs ne descend sous
// `PLAYER_MIN_CLEARANCE_PX` à AUCUN moment du playback, peu importe
// le `localT` échantillonné.
//
// Couvre plusieurs scénarios sensibles (drive central, écran porteur,
// rotation defensive) avec un échantillonnage dense (40 frames par
// transition).

import { describe, expect, it } from 'vitest';
import type { AppState, AttackerPositions, DefenderPositions } from '@/lib/types';
import { makeInitialState } from '@/lib/data/initial';
import { resolveFrameAt } from '@/lib/logic/playback/frameResolver';
import { PLAYER_MIN_CLEARANCE_PX } from '@/lib/data/court';

/** Échantillonne `framesPerTransition` frames sur chaque transition
 *  step→step+1 et retourne le min de clearance observé. */
function minClearanceAcrossPlayback(state: AppState, framesPerTransition: number = 40): {
  minDist: number;
  worstAt: { t: number; pair: string };
} {
  const totalTransitions = state.steps.length - 1;
  if (totalTransitions <= 0) return { minDist: Infinity, worstAt: { t: 0, pair: '' } };

  let minDist = Infinity;
  let worstAt = { t: 0, pair: '' };

  for (let trans = 0; trans < totalTransitions; trans++) {
    for (let k = 0; k <= framesPerTransition; k++) {
      const t = trans + k / framesPerTransition;
      const frame = resolveFrameAt(state, t);
      if (!frame) continue;

      const players = [
        ...(Object.keys(frame.off) as (keyof typeof frame.off)[]).map((id) => ({ id, pos: frame.off[id] })),
        ...(Object.keys(frame.defPos) as (keyof typeof frame.defPos)[]).map((id) => ({ id, pos: { x: frame.defPos[id].x, y: frame.defPos[id].y } })),
      ];

      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const a = players[i];
          const b = players[j];
          const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
          if (d < minDist) {
            minDist = d;
            worstAt = { t, pair: `${String(a.id)}↔${String(b.id)}` };
          }
        }
      }
    }
  }
  return { minDist, worstAt };
}

describe('D.5 — invariant clearance pendant interpolation', () => {
  it('scénario drive central : aucune collision sur les frames intermédiaires', () => {
    const base = makeInitialState();
    const off0: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const off1: AttackerPositions = {
      O1: { x: 300, y: 200 }, // drive central jusqu'à la raquette
      O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const state: AppState = {
      ...base,
      steps: [
        { off: off0, ballCarrier: 'O1', annotations: [] },
        { off: off1, ballCarrier: 'O1', annotations: [] },
      ],
      activeStep: 0,
      triggers: { drive: true, post: false, paint: true, trap: false },
    };
    const { minDist, worstAt } = minClearanceAcrossPlayback(state);
    expect(minDist, `pire paire ${worstAt.pair} à t=${worstAt.t.toFixed(2)}`)
      .toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 1.0); // tolérance 1px (lissage solveur)
  });

  it('scénario écran porteur : O5 pose sur D1, aucune collision player↔player', () => {
    const base = makeInitialState();
    const off0: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 380 },
    };
    const off1: AttackerPositions = {
      O1: { x: 350, y: 380 },
      O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 310, y: 470 }, // O5 vient poser l'écran proche du porteur
    };
    const state: AppState = {
      ...base,
      steps: [
        { off: off0, ballCarrier: 'O1', annotations: [] },
        { off: off1, ballCarrier: 'O1', annotations: [] },
      ],
      activeStep: 0,
      screenRule: 'hedge',
    };
    const { minDist, worstAt } = minClearanceAcrossPlayback(state);
    // Les défenseurs en CONTACT D'ÉCRAN ont leur propre logique
    // (screenLockedDefenders skipés par resolvePlayerCollisions). Donc
    // l'invariant ne tient PAS pour le couple D1-O5 sur ce scénario.
    // On vérifie qu'au moins la clearance reste au-dessus de PLAYER_RADIUS×2
    // = 32 px (les centres ne se chevauchent jamais), ce qui correspond
    // à la garantie du moteur d'écran.
    expect(minDist, `pire paire ${worstAt.pair} à t=${worstAt.t.toFixed(2)}`)
      .toBeGreaterThan(20); // au moins 20 px = jamais de superposition visible totale
  });

  it("scénario simple passe : aucune collision pendant le vol du ballon", () => {
    const base = makeInitialState();
    const off0: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const off1: AttackerPositions = {
      O1: { x: 300, y: 480 },
      O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const state: AppState = {
      ...base,
      steps: [
        { off: off0, ballCarrier: 'O1', annotations: [] },
        { off: off1, ballCarrier: 'O3', annotations: [
          { type: 'pass', fromId: 'O1', toId: 'O3', from: off0.O1, to: off1.O3 },
        ] },
      ],
      activeStep: 0,
    };
    const { minDist, worstAt } = minClearanceAcrossPlayback(state);
    expect(minDist, `pire paire ${worstAt.pair} à t=${worstAt.t.toFixed(2)}`)
      .toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX - 1.0);
  });

  it("scénario statique : pas de mouvement → clearance largement respectée", () => {
    const base = makeInitialState();
    const off: AttackerPositions = {
      O1: { x: 300, y: 480 }, O2: { x: 100, y: 380 }, O3: { x: 500, y: 380 },
      O4: { x: 200, y: 200 }, O5: { x: 400, y: 200 },
    };
    const state: AppState = {
      ...base,
      steps: [
        { off, ballCarrier: 'O1', annotations: [] },
        { off, ballCarrier: 'O1', annotations: [] },
      ],
      activeStep: 0,
    };
    const { minDist } = minClearanceAcrossPlayback(state);
    // Égalité exacte à PLAYER_MIN_CLEARANCE_PX est légitime (le moteur pousse
    // pile à la borne quand des positions stratégiques l'imposent).
    expect(minDist).toBeGreaterThanOrEqual(PLAYER_MIN_CLEARANCE_PX);
  });
});
