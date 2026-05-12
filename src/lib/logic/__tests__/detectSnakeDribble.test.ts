// Tests B4 — détection snake dribble (pattern V sur 3 steps).

import { describe, expect, it } from 'vitest';
import type { AttackerPositions, Matchups } from '@/lib/types';
import { detectSnakeDribble } from '../screens';

const matchups: Matchups = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

/** Factory : O1 porteur, O5 poseur à `screenerPos`. Tous les autres parqués
 *  hors du jeu pour éviter qu'ils soient choisis comme candidats. */
function buildOff(carrier: { x: number; y: number }, screener: { x: number; y: number }): AttackerPositions {
  return {
    O1: carrier,
    O2: { x: 0, y: 0 },
    O3: { x: 600, y: 0 },
    O4: { x: 0, y: 600 },
    O5: screener,
  };
}

describe('detectSnakeDribble', () => {
  it('null sans prevOff ou prevPrevOff', () => {
    const off = buildOff({ x: 300, y: 470 }, { x: 300, y: 440 });
    expect(detectSnakeDribble(off, null, null, 'O1', matchups, 35)).toBeNull();
    expect(detectSnakeDribble(off, off, null, 'O1', matchups, 35)).toBeNull();
  });

  it("détecte un V parfait : engage → retraite → ré-engage avec MÊME poseur", () => {
    // O5 fixe à (300, 440). O1 fait un V autour :
    //  - N-2 : O1 à (300, 470) — distance 30 (engagé)
    //  - N-1 : O1 à (300, 540) — distance 100 (retraite, sommet du V)
    //  - N   : O1 à (305, 470) — distance ~30 (ré-engagé)
    const screener = { x: 300, y: 440 };
    const prevPrevOff = buildOff({ x: 300, y: 470 }, screener);
    const prevOff = buildOff({ x: 300, y: 540 }, screener);
    const off = buildOff({ x: 305, y: 470 }, screener);

    const snake = detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35);
    expect(snake).not.toBeNull();
    expect(snake!.screener).toBe('O5');
    expect(snake!.carrier).toBe('O1');
    expect(snake!.carrierDef).toBe('D1');
    expect(snake!.screenerDef).toBe('D5');
    expect(snake!.distAtPeak).toBeGreaterThan(snake!.distAtEntry + 25);
    expect(snake!.distAtPeak).toBeGreaterThan(snake!.distAtReturn + 25);
  });

  it("null si le porteur n'a pas vraiment bougé sur un segment (micro-jitter)", () => {
    // Retraite réelle puis quasi-statique : pas un snake.
    const screener = { x: 300, y: 440 };
    const prevPrevOff = buildOff({ x: 300, y: 470 }, screener);
    const prevOff = buildOff({ x: 300, y: 540 }, screener);
    const off = buildOff({ x: 302, y: 542 }, screener); // ~3px de prevOff
    const snake = detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35);
    expect(snake).toBeNull();
  });

  it("null si retraite insuffisante (< 25 px)", () => {
    const screener = { x: 300, y: 440 };
    const prevPrevOff = buildOff({ x: 300, y: 470 }, screener); // d=30
    const prevOff = buildOff({ x: 300, y: 480 }, screener);     // d=40 → upDelta = 10
    const off = buildOff({ x: 305, y: 470 }, screener);
    expect(detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35)).toBeNull();
  });

  it("null si pas de ré-engagement à N (retraite continue)", () => {
    const screener = { x: 300, y: 440 };
    const prevPrevOff = buildOff({ x: 300, y: 470 }, screener); // d=30
    const prevOff = buildOff({ x: 300, y: 540 }, screener);     // d=100
    const off = buildOff({ x: 300, y: 560 }, screener);          // d=120 (continue à fuir)
    expect(detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35)).toBeNull();
  });

  it("null si pas d'engagement à N-2 (porteur loin du poseur au départ)", () => {
    const screener = { x: 300, y: 100 }; // très loin
    const prevPrevOff = buildOff({ x: 300, y: 470 }, screener); // d=370
    const prevOff = buildOff({ x: 300, y: 540 }, screener);     // d=440
    const off = buildOff({ x: 305, y: 470 }, screener);          // d=370
    expect(detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35)).toBeNull();
  });

  it("choisit le V le plus marqué quand 2 candidats poseurs", () => {
    // O5 fait un petit V (delta 30), O2 fait un grand V (delta 80).
    // Le détecteur doit préférer O2.
    // O1 va alterner pour créer un V grand sur O2.
    const o5 = { x: 300, y: 440 };
    const prevPrevOff: AttackerPositions = {
      O1: { x: 200, y: 380 }, // engagé sur O2
      O2: { x: 180, y: 380 }, // poseur 1, d=20
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 600 },
      O5: o5, // poseur 2 distant
    };
    const prevOff: AttackerPositions = {
      O1: { x: 280, y: 380 }, // retraite vers droite
      O2: { x: 180, y: 380 }, // d=100 (sommet V)
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 600 },
      O5: o5,
    };
    const off: AttackerPositions = {
      O1: { x: 200, y: 385 }, // re-engagé sur O2, d~20
      O2: { x: 180, y: 380 },
      O3: { x: 600, y: 0 },
      O4: { x: 0, y: 600 },
      O5: o5,
    };
    const snake = detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35);
    expect(snake).not.toBeNull();
    expect(snake!.screener).toBe('O2'); // V plus marqué
  });

  it("retourne les bons matchups (carrierDef/screenerDef)", () => {
    const screener = { x: 300, y: 440 };
    const prevPrevOff = buildOff({ x: 300, y: 470 }, screener);
    const prevOff = buildOff({ x: 300, y: 540 }, screener);
    const off = buildOff({ x: 305, y: 470 }, screener);
    const snake = detectSnakeDribble(off, prevOff, prevPrevOff, 'O1', matchups, 35);
    expect(snake!.carrierDef).toBe('D1');
    expect(snake!.screenerDef).toBe('D5');
  });
});
