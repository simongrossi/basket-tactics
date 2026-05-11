// Tests de frame finale (resolveFrameAt) : valident que le défenseur en
// contact d'écran ne se "téléporte" PAS sur le porteur pendant la transition
// — pas seulement que les briques freeze/curve/easing fonctionnent en
// isolation. Couvre le bug central : followDefendersAtFrame court-circuitait
// tout le réalisme en réécrivant la position de D1 à chaque frame.

import { describe, it, expect } from 'vitest';
import { resolveFrameAt } from '../playback/frameResolver';
import { makeInitialState } from '../../data/initial';
import type { AppState, Annotation, Step } from '../../types';

/**
 * Construit un scénario minimal 2 steps avec un écran O3→O1 entre les deux,
 * D1 démarre éloigné, doit "prendre" l'écran lors de la transition.
 */
function buildScreenScenario(quality: number = 100): AppState {
  const base = makeInitialState();
  const annotations: Annotation[] = [
    {
      type: 'screen',
      fromId: 'O3',
      toId: 'O1',
      from: { x: 470, y: 380 },
      to: { x: 320, y: 460 },
      quality,
    } as Annotation,
  ];
  const step0: Step = {
    off: {
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 470, y: 380 },
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations,
  };
  const step1: Step = {
    off: {
      // Le porteur reste, le poseur s'est mis en place
      O1: { x: 300, y: 470 },
      O2: { x: 130, y: 380 },
      O3: { x: 320, y: 460 }, // poseur collé à O1
      O4: { x: 220, y: 230 },
      O5: { x: 380, y: 230 },
    },
    ballCarrier: 'O1',
    annotations: [],
  };
  return {
    ...base,
    steps: [step0, step1],
    screenRule: 'hedge',
    defenseInitial: {
      // D1 colle son homme dès le départ (sinon le screen detection rate
      // l'écran : O3 doit être à <screenRadius=35px de D1).
      D1: { x: 300, y: 460 },
      D2: { x: 130, y: 370 },
      D3: { x: 460, y: 370 },
      D4: { x: 220, y: 220 },
      D5: { x: 380, y: 220 },
    },
    activeStep: 0,
  } as AppState;
}

describe('resolveFrameAt — contact écran de bout en bout (Étape diagnostic)', () => {
  describe('Quality 100 (lockdown) — D1 doit rester collé au poseur', () => {
    const state = buildScreenScenario(100);

    it('à t=0.5 : D1 est au contact du poseur (clearance respectée)', () => {
      const frame = resolveFrameAt(state, 0.5);
      expect(frame).not.toBeNull();
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      // D1 doit être PROCHE du poseur (au contact, à ~MIN_CLEARANCE), pas
      // baladé à mi-chemin. Tolérance large pour absorber les variations
      // géométriques selon stance/règle.
      expect(distToScreener, 'D1 doit être au contact du poseur (≤ 50px)')
        .toBeLessThan(50);
      // Et jamais à l'intérieur du poseur.
      expect(distToScreener, 'D1 doit respecter la clearance avec le poseur')
        .toBeGreaterThanOrEqual(33);
    });

    it("à t=0.7 : D1 n'a pas encore récupéré (proche du poseur)", () => {
      const frame = resolveFrameAt(state, 0.7);
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      expect(distToScreener, 'D1 doit encore être proche du poseur à 70%')
        .toBeLessThan(80);
    });

    it('trajectoire : D1 ne traverse jamais le rayon du poseur', () => {
      // Échantillonne t de 0 à 1, vérifie que D1 reste à >= 16px (PLAYER_RADIUS)
      // du poseur. Pas de coupage à travers le disque.
      const screener = state.steps[1].off.O3;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        const dist = Math.hypot(d1.x - screener.x, d1.y - screener.y);
        expect(dist, `t=${t.toFixed(2)} : D1 ne doit pas traverser le poseur`)
          .toBeGreaterThanOrEqual(15); // marge 1px pour les arrondis
      }
    });
  });

  describe('Quality 0 (ghost) — D1 récupère son homme normalement', () => {
    const state = buildScreenScenario(0);

    it('à t=0.7 : D1 est plus proche de O1 que du poseur (faux écran)', () => {
      const frame = resolveFrameAt(state, 0.7);
      const d1 = frame!.defPos.D1;
      const screener = frame!.off.O3;
      const carrier = frame!.off.O1;
      const distToScreener = Math.hypot(d1.x - screener.x, d1.y - screener.y);
      const distToCarrier = Math.hypot(d1.x - carrier.x, d1.y - carrier.y);
      // À ghost, D1 ignore le poseur et suit son homme → plus proche de O1.
      expect(distToCarrier).toBeLessThan(distToScreener);
    });
  });

  describe('Continuité dans le temps — pas de saut visuel', () => {
    const state = buildScreenScenario(75);

    it("la position de D1 varie de moins de 30px entre deux frames adjacentes", () => {
      let prev: { x: number; y: number } | null = null;
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const frame = resolveFrameAt(state, t);
        if (!frame) continue;
        const d1 = frame.defPos.D1;
        if (prev) {
          const jump = Math.hypot(d1.x - prev.x, d1.y - prev.y);
          expect(jump, `t=${t.toFixed(2)} : saut de D1 (avant fix : ~70px à la transition follow)`)
            .toBeLessThan(30);
        }
        prev = { x: d1.x, y: d1.y };
      }
    });
  });
});
