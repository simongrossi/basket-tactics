// Tests Phase E.1 V1 — modèle de rebond.

import { describe, it, expect } from 'vitest';
import type {
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import { HOOP } from '@/lib/data/court';
import { computeRebound } from '../rebound';

function makeDef(positions: Record<DefenderId, Point>): ComputedDefense {
  const out = {} as ComputedDefense;
  (Object.keys(positions) as DefenderId[]).forEach((id) => {
    out[id] = {
      ...positions[id],
      late: false,
      helpFactor: 0,
      isCarrierDefender: false,
      matchedTo: 'O1' as AttackerId,
      onScreen: false,
      switchedThisStep: false,
      orientation: 0,
      gazeOrientation: 0,
      facing: { x: 0, y: 0 },
      armBallSide: { x: 0, y: 0 },
      armManSide: { x: 0, y: 0 },
    };
  });
  return out;
}

function alwaysRng(value: number): () => number {
  return () => value;
}

describe('computeRebound — répartition de base', () => {
  it("retourne 'team-out' si aucun joueur n'est dans le rayon d'éligibilité", () => {
    const off: AttackerPositions = {
      O1: { x: 50, y: 1000 },
      O2: { x: 50, y: 1000 },
      O3: { x: 50, y: 1000 },
      O4: { x: 50, y: 1000 },
      O5: { x: 50, y: 1000 },
    };
    const defPos = makeDef({
      D1: { x: 50, y: 1000 },
      D2: { x: 50, y: 1000 },
      D3: { x: 50, y: 1000 },
      D4: { x: 50, y: 1000 },
      D5: { x: 50, y: 1000 },
    });
    const result = computeRebound({
      off,
      defPos,
      hoop: HOOP,
      shotPos: HOOP,
      shooter: 'O1',
      rng: alwaysRng(0.5),
    });
    expect(result.type).toBe('team-out');
    expect(result.rebounder).toBeNull();
  });

  it('attaquant proche du panier peut récupérer un rebond offensif', () => {
    // Tous les joueurs sont loin sauf O5 sous le cercle.
    const off: AttackerPositions = {
      O1: { x: 50, y: 700 },
      O2: { x: 50, y: 700 },
      O3: { x: 50, y: 700 },
      O4: { x: 50, y: 700 },
      O5: { x: HOOP.x, y: HOOP.y + 20 },
    };
    const defPos = makeDef({
      D1: { x: 50, y: 700 },
      D2: { x: 50, y: 700 },
      D3: { x: 50, y: 700 },
      D4: { x: 50, y: 700 },
      D5: { x: 50, y: 700 },
    });
    const result = computeRebound({
      off,
      defPos,
      hoop: HOOP,
      shotPos: HOOP,
      shooter: 'O1',
      rng: alwaysRng(0.5),
    });
    expect(result.type).toBe('offensive');
    expect(result.rebounder).toBe('O5');
  });

  it("défenseur proche du panier récupère plus souvent qu'un attaquant équidistant (DEFENSIVE_BONUS)", () => {
    // O5 et D5 à équidistance du panier. Sur 100 tirages, D5 doit
    // gagner clairement majoritaire (≥ 60 %).
    const off: AttackerPositions = {
      O1: { x: 50, y: 700 },
      O2: { x: 50, y: 700 },
      O3: { x: 50, y: 700 },
      O4: { x: 50, y: 700 },
      O5: { x: HOOP.x - 30, y: HOOP.y + 10 },
    };
    const defPos = makeDef({
      D1: { x: 50, y: 700 },
      D2: { x: 50, y: 700 },
      D3: { x: 50, y: 700 },
      D4: { x: 50, y: 700 },
      D5: { x: HOOP.x + 30, y: HOOP.y + 10 },
    });
    let defWins = 0;
    for (let i = 0; i < 100; i += 1) {
      const result = computeRebound({
        off,
        defPos,
        hoop: HOOP,
        shotPos: HOOP,
        shooter: 'O1',
        rng: alwaysRng((i + 0.5) / 100),
      });
      if (result.type === 'defensive') defWins += 1;
    }
    expect(defWins).toBeGreaterThanOrEqual(60);
  });
});

describe('computeRebound — modificateurs profil', () => {
  it('un rim-roller a un poids supérieur à un shooter équidistant', () => {
    const off: AttackerPositions = {
      O1: { x: 50, y: 700 },
      O2: { x: 50, y: 700 },
      O3: { x: 50, y: 700 },
      O4: { x: HOOP.x - 30, y: HOOP.y + 30 }, // rim-roller proche
      O5: { x: HOOP.x + 30, y: HOOP.y + 30 }, // shooter équidistant
    };
    // Pas de défenseur dans le rayon (= ils sont tous loin).
    const defPos = makeDef({
      D1: { x: 50, y: 700 },
      D2: { x: 50, y: 700 },
      D3: { x: 50, y: 700 },
      D4: { x: 50, y: 700 },
      D5: { x: 50, y: 700 },
    });
    const result = computeRebound({
      off,
      defPos,
      hoop: HOOP,
      shotPos: HOOP,
      attackerProfiles: {
        O1: 'creator',
        O2: 'creator',
        O3: 'creator',
        O4: 'rim-roller',
        O5: 'shooter',
      },
      shooter: 'O1',
      rng: alwaysRng(0.99), // tire fin de spectrum, pour aller chercher le moins probable
    });
    // Avec rng=0.99 on prend le dernier dans l'ordre des poids, mais
    // le poids de O4 > O5 quelle que soit la position du tirage.
    const wO4 = result.weights.O4 ?? 0;
    const wO5 = result.weights.O5 ?? 0;
    expect(wO4).toBeGreaterThan(wO5);
  });
});

describe('computeRebound — pénalité shooter', () => {
  it('le shooter a un poids réduit de SHOOTER_REBOUND_PENALTY', () => {
    const off: AttackerPositions = {
      O1: { x: HOOP.x, y: HOOP.y + 30 }, // shooter
      O2: { x: HOOP.x, y: HOOP.y + 30 }, // non-shooter équidistant
      O3: { x: 50, y: 700 },
      O4: { x: 50, y: 700 },
      O5: { x: 50, y: 700 },
    };
    const defPos = makeDef({
      D1: { x: 50, y: 700 },
      D2: { x: 50, y: 700 },
      D3: { x: 50, y: 700 },
      D4: { x: 50, y: 700 },
      D5: { x: 50, y: 700 },
    });
    const result = computeRebound({
      off,
      defPos,
      hoop: HOOP,
      shotPos: HOOP,
      shooter: 'O1',
      rng: alwaysRng(0.5),
    });
    expect((result.weights.O1 ?? 0)).toBeLessThan((result.weights.O2 ?? 0));
  });
});

describe('computeRebound — déterminisme', () => {
  it("même RNG produit le même résultat", () => {
    const off: AttackerPositions = {
      O1: { x: 280, y: 380 },
      O2: { x: 130, y: 320 },
      O3: { x: 470, y: 320 },
      O4: { x: 200, y: 200 },
      O5: { x: 300, y: 240 },
    };
    const defPos = makeDef({
      D1: { x: 300, y: 346 },
      D2: { x: 130, y: 318 },
      D3: { x: 470, y: 318 },
      D4: { x: 200, y: 198 },
      D5: { x: 300, y: 238 },
    });
    const a = computeRebound({
      off, defPos, hoop: HOOP, shotPos: HOOP,
      shooter: 'O1', rng: alwaysRng(0.42),
    });
    const b = computeRebound({
      off, defPos, hoop: HOOP, shotPos: HOOP,
      shooter: 'O1', rng: alwaysRng(0.42),
    });
    expect(a.rebounder).toBe(b.rebounder);
    expect(a.type).toBe(b.type);
  });
});
